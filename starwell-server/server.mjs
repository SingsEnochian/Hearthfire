import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { concordanceSchema, evaluateConcordance } from './public/concordance-engine.js';
import { fetchEnvironmentReading } from './observer-environment.mjs';
import { calculateSheetConvergence, normaliseLocationState } from './sheet-convergence.mjs';
import { APP_IDENTITY, APP_NAME, APP_VERSION } from './version.mjs';
import {
  queryBM25, getNode, getEdges, traverse, queryByKind, getStats as graphStats,
  addNode as graphAddNode, addEdge as graphAddEdge,
} from './graph-store.mjs';
import { activeAgentRegistry, contributorAttributionRegistry, loadModuleManifests } from './hearthgate-registry.mjs';
import {
  ROOM_DEFINITIONS, MODULE_MANIFEST_SCHEMA, AGENT_IDS,
  loadWizardConfig, saveWizardConfig,
  startAgent, stopAgent, getAgentRuntimeConfig,
  getRoomDefinition, getRoomWithAgent, getAllRoomsWithAgents,
} from './rooms.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(__dirname, 'public');
const reiManifestPath = resolve(__dirname, 'rei-mythience.manifest.json');
const worldsDir = resolve(__dirname, '../worlds');
const sanctumAnchorPath = resolve(__dirname, 'data/sanctum-anchor.json');
const ledgerPath = resolve(__dirname, 'data/action-ledger.jsonl');
// APP_IDENTITY sourced from version.mjs — single source of truth
const round4 = (v) => Math.round(v * 10000) / 10000;

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const startedAt = Date.now();
const MAX_BODY_BYTES = 32 * 1024;
const ENV_TTL_MS = 60_000;
let _envCache = null; // { value, fetchedAt, anchorKey }
let _sanctumAnchor = undefined; // undefined = not yet loaded; null = loaded, none set

function _anchorKey(anchor) {
  return anchor ? `${anchor.lat}|${anchor.lon}` : 'none';
}

async function getSanctumAnchor() {
  if (_sanctumAnchor !== undefined) return _sanctumAnchor;
  try {
    _sanctumAnchor = JSON.parse(await readFile(sanctumAnchorPath, 'utf8'));
  } catch {
    _sanctumAnchor = null;
  }
  return _sanctumAnchor;
}

async function saveSanctumAnchor(anchor) {
  await mkdir(resolve(__dirname, 'data'), { recursive: true });
  await writeFile(sanctumAnchorPath, JSON.stringify(anchor, null, 2), 'utf8');
}

async function appendLedger(entry) {
  await mkdir(resolve(__dirname, 'data'), { recursive: true });
  const line = JSON.stringify({ ...entry, recordedAt: new Date().toISOString() }) + '\n';
  const { appendFile } = await import('node:fs/promises');
  await appendFile(ledgerPath, line, 'utf8');
}

// Advisor validation pass — enforces epistemic register rules (deterministic, no LLM required for 0.001)
function advisorValidate(lenses) {
  const flags = [];
  if (lenses.math?.localFoldProbability !== 0 && lenses.math?.localFoldProbability !== null) {
    flags.push('MATH: localFoldProbability must be 0 (nonsingular map) or null (uncalibrated) — upgrade detected');
  }
  if (lenses.math?.physicalFoldProbability !== null) {
    flags.push('MATH: physicalFoldProbability must remain null — physical spacetime fold not claimed');
  }
  if (lenses.environment?.jspace && !lenses.environment.jspace.claimLabel) {
    flags.push('ENV: jspace missing claimLabel');
  }
  return {
    passed: flags.length === 0,
    flags,
    advisorRole: 'deterministic-rule-check',
    note: 'Hearthgate: Arkfire 0.001 uses deterministic advisor rules. LLM advisor reserved for future editions.',
  };
}
const JLENS_BASE = process.env.JLENS_URL || 'http://127.0.0.1:8765';
const JLENS_TIMEOUT_MS = 10_000;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function json(response, status, body, requestMethod = 'GET') {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (requestMethod === 'HEAD') response.end();
  else response.end(JSON.stringify(body));
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function loadWorlds() {
  try {
    const files = (await readdir(worldsDir)).filter((f) => f.endsWith('.json'));
    const worlds = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(join(worldsDir, f), 'utf8'))),
    );
    worlds.sort((a, b) => (a.fiberPosition ?? 99) - (b.fiberPosition ?? 99));
    return worlds;
  } catch {
    return [];
  }
}

const EMOTIONS = Object.freeze([
  'Joy', 'Grief', 'Curiosity', 'Stillness', 'Fear',
  'Love', 'Hope', 'Doubt', 'Determination', 'Awe',
]);

function validateCastBody(body) {
  const errors = [];
  if (!body.world || typeof body.world !== 'string') errors.push('world: required string');
  if (!Array.isArray(body.emotions) || body.emotions.length === 0) errors.push('emotions: required non-empty array');
  if (body.emotions?.some((e) => !EMOTIONS.includes(e))) errors.push(`emotions: must be values from [${EMOTIONS.join(', ')}]`);
  if (!body.concordanceVector || typeof body.concordanceVector !== 'object') errors.push('concordanceVector: required object with pulse, coherence, resonance, entropy, memory, axis');
  return errors;
}

async function readRequestJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('request-body-too-large');
      error.code = 'request-body-too-large';
      throw error;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const requested = decoded === '/' ? '/index.html' : decoded;
  const candidate = resolve(publicRoot, `.${normalize(requested)}`);
  return candidate.startsWith(publicRoot) ? candidate : null;
}

async function serveStatic(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
    return;
  }

  const filePath = safePath(request.url || '/');
  if (!filePath) {
    json(response, 403, { ok: false, error: 'threshold-denied' }, request.method);
    return;
  }

  try {
    const fileStat = await stat(filePath);
    const resolvedPath = fileStat.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(resolvedPath);
    response.writeHead(200, {
      'content-type': contentTypes[extname(resolvedPath)] || 'application/octet-stream',
      'cache-control': extname(resolvedPath) === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    try {
      const fallback = await readFile(join(publicRoot, 'index.html'));
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'same-origin',
      });
      if (request.method === 'HEAD') response.end();
      else response.end(fallback);
    } catch {
      json(response, 404, { ok: false, error: 'place-not-found' }, request.method);
    }
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://hearthfire.local');
  const path = requestUrl.pathname;

  if (path === '/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const worlds = await loadWorlds();
    json(response, 200, {
      ok: true,
      place: 'STARWELL within Hearthfire',
      framework: 'REI Mythience',
      concordanceEngine: '0.2.0',
      worldRegistry: `${worlds.length} worlds loaded`,
      observerCast: '/api/observer/cast',
      observerEnvironment: '/api/observer/environment',
      observerWorkspace: '/api/observer/workspace',
      sanctumAnchor: '/api/sanctum-anchor',
      hearthgateFold: '/api/hearthgate/fold',
      hearthgateModules: '/api/hearthgate/modules',
      hearthgateRegistry: '/api/hearthgate/registry',
      hearthgateVersion: APP_IDENTITY,
      rooms: '/api/rooms',
      wizard: '/api/wizard',
      wizardConfig: '/api/wizard/config',
      wizardConstellation: '/api/wizard/constellation',
      graphStats: '/api/graph',
      graphQuery: '/api/graph/query?q=TEXT',
      graphNode: '/api/graph/node/:id',
      graphTraverse: '/api/graph/traverse',
      portal: 'room-reskin-v1',
      runtime: process.version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    }, request.method);
    return;
  }

  if (path === '/api/state') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    json(response, 200, {
      schema: 'hearthfire.place-state/v1',
      place: 'starwell',
      hostPlace: 'hearthfire',
      centre: 'hearth',
      framework: 'rei-mythience',
      frameworkRoute: '/api/rei',
      concordanceSchemaRoute: '/api/concordance/schema',
      concordanceEvaluateRoute: '/api/concordance/evaluate',
      portalMode: 'same-room-reversible-reskin',
      rooms: ['observatory', 'library', 'grove', 'workshop', 'atlas'],
      consent: 'user-invoked',
      persistence: 'device-local',
    }, request.method);
    return;
  }

  if (path === '/api/rei') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    try {
      const manifest = await readJsonFile(reiManifestPath);
      json(response, 200, manifest, request.method);
    } catch {
      json(response, 503, {
        ok: false,
        error: 'rei-mythience-manifest-unavailable',
      }, request.method);
    }
    return;
  }

  if (path === '/api/worlds') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const worlds = await loadWorlds();
    json(response, 200, { schema: 'hearthfire.world-registry/v1', worlds }, request.method);
    return;
  }

  const worldMatch = path.match(/^\/api\/worlds\/([^/]+)$/);
  if (worldMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const worlds = await loadWorlds();
    const world = worlds.find((w) => w.id === worldMatch[1]);
    if (!world) {
      json(response, 404, { ok: false, error: 'world-not-found', id: worldMatch[1] }, request.method);
      return;
    }
    json(response, 200, world, request.method);
    return;
  }

  if (path === '/api/observer/cast') {
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    try {
      const body = await readRequestJson(request);
      const errors = validateCastBody(body);
      if (errors.length) {
        json(response, 400, { ok: false, error: 'invalid-cast-body', details: errors }, request.method);
        return;
      }

      const worlds = await loadWorlds();
      const targetWorld = worlds.find((w) => w.id === body.world);
      if (!targetWorld) {
        json(response, 422, { ok: false, error: 'unknown-world', world: body.world }, request.method);
        return;
      }

      const vector = body.concordanceVector;
      const concordance = evaluateConcordance(vector, {
        mode: 'observer-cast',
        sources: ['observer-instrument', ...(body.provenance?.sources ?? [])],
        note: body.provenance?.note ?? null,
      });

      const primaryEmotion = body.emotions[0];
      const emotionCount = body.emotions.length;
      const entropyEstimate = Math.min(0.1 * (emotionCount - 1), 0.4);
      const entanglementCoefficient = Math.max(
        0,
        Math.min(1, concordance.score * (1 - entropyEstimate)),
      );

      const observation = {
        protocol: 'hearthfire.observation/v1',
        id: randomUUID(),
        observedAt: concordance.observedAt,
        observedBy: body.observedBy ?? 'observer',
        place: { id: 'hearthfire', label: 'Hearthfire' },
        world: targetWorld.id,
        kind: 'glyph-cast',
        claimLabel: targetWorld.defaultEpistemicStatus === 'observation'
          ? 'subjective-observation'
          : targetWorld.claimLabel,
        consent: body.consent ?? 'local-only',
        provenance: {
          source: 'observer-instrument',
          createdBy: body.observedBy ?? 'observer',
        },
        payload: {
          emotions: body.emotions,
          primaryEmotion,
          narrativeThread: body.narrativeThread ?? '',
          description: body.description ?? '',
          notes: body.notes ?? '',
          concordance,
          worldFiber: {
            id: targetWorld.id,
            label: targetWorld.label,
            fiberPosition: targetWorld.fiberPosition,
            coupledWorlds: targetWorld.coupledWorlds,
            entanglementCoefficient: Math.round(entanglementCoefficient * 100000) / 100000,
          },
        },
      };

      json(response, 200, { ok: true, observation }, request.method);
    } catch (error) {
      const tooLarge = error?.code === 'request-body-too-large';
      json(response, tooLarge ? 413 : 400, {
        ok: false,
        error: tooLarge ? 'request-body-too-large' : 'invalid-cast-request',
      }, request.method);
    }
    return;
  }

  if (path === '/api/observer/environment') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    try {
      const anchor = await getSanctumAnchor();
      const anchorKey = _anchorKey(anchor);
      const now = Date.now();
      if (!_envCache || now - _envCache.fetchedAt > ENV_TTL_MS || _envCache.anchorKey !== anchorKey) {
        _envCache = { value: await fetchEnvironmentReading(anchor), fetchedAt: now, anchorKey };
      }
      const reading = _envCache.value;
      const concordance = evaluateConcordance(reading.premaq, {
        mode: 'environment-feed',
        sources: ['noaa-solar-wind', 'noaa-kp', 'noaa-sunspots', 'usgs-seismic', 'gwosc-gw', 'meeus-lunar'],
        note: 'Derived from live physical environment channels',
      });
      json(response, 200, { ok: true, reading, concordance }, request.method);
    } catch (err) {
      json(response, 503, { ok: false, error: 'environment-fetch-failed', details: err.message ?? String(err) }, request.method);
    }
    return;
  }

  // ── Sanctum Anchor ────────────────────────────────────────────────────────

  if (path === '/api/sanctum-anchor') {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const anchor = await getSanctumAnchor();
      json(response, 200, { ok: true, sanctumAnchor: anchor }, request.method);
      return;
    }
    if (request.method === 'PUT') {
      try {
        const body = await readRequestJson(request);
        const lat = Number(body.lat);
        const lon = Number(body.lon);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          json(response, 400, { ok: false, error: 'lat-invalid', details: 'lat must be a number in [-90, 90]' }, request.method);
          return;
        }
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
          json(response, 400, { ok: false, error: 'lon-invalid', details: 'lon must be a number in [-180, 180]' }, request.method);
          return;
        }
        const anchor = {
          lat: Math.round(lat * 10000) / 10000,
          lon: Math.round(lon * 10000) / 10000,
          label: typeof body.label === 'string' ? body.label.slice(0, 64) : null,
          setAt: new Date().toISOString(),
        };
        _sanctumAnchor = anchor;
        _envCache = null; // bust cache so next read uses new anchor
        await saveSanctumAnchor(anchor);
        json(response, 200, { ok: true, sanctumAnchor: anchor }, request.method);
      } catch (err) {
        const tooLarge = err?.code === 'request-body-too-large';
        json(response, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'request-body-too-large' : 'anchor-error' }, request.method);
      }
      return;
    }
    json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
    return;
  }

  // ── Hearthgate: Arkfire 0.001 ────────────────────────────────────────────
  // Multi-lens fold analysis: math (Vee) + environment (PREMAQ) + graph (BM25)
  // Advisor validates epistemic registers before synthesis.
  // All readings appended to data/action-ledger.jsonl (DR-003: JSONL = append-only history).

  if (path === '/api/hearthgate/fold') {
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    try {
      const body = await readRequestJson(request);
      const anchor = body.sanctumAnchor ?? await getSanctumAnchor();
      if (!anchor || !Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lon)) {
        json(response, 400, { ok: false, error: 'sanctum-anchor-required', details: 'Provide sanctumAnchor:{lat,lon} or set one via PUT /api/sanctum-anchor' }, request.method);
        return;
      }

      const foldId = randomUUID();
      const now = new Date();

      // ── Worker 1: Location-direct math lens (MATHEMATICAL_DERIVATION + LOCATION_INPUT)
      const locationState = normaliseLocationState({
        latitude: anchor.lat,
        longitude: anchor.lon,
        altitudeM: anchor.elevation ?? 0,
        timestamp: now,
      });
      const mathResult = calculateSheetConvergence(locationState);

      // ── Worker 2: Environment + PREMAQ lens (PHYSICS_MODEL)
      const envAnchor = await getSanctumAnchor();
      const envAnchorKey = _anchorKey(envAnchor);
      const envNow = Date.now();
      if (!_envCache || envNow - _envCache.fetchedAt > ENV_TTL_MS || _envCache.anchorKey !== envAnchorKey) {
        _envCache = { value: await fetchEnvironmentReading(envAnchor), fetchedAt: envNow, anchorKey: envAnchorKey };
      }
      const envReading = _envCache.value;

      // ── Worker 3: Graph lens (BM25 retrieval — fold-relevant concepts)
      const graphPrompt = body.intent ?? `J-space fold at lat ${anchor.lat} lon ${anchor.lon}`;
      const graphHits = queryBM25(graphPrompt, 8);

      // ── Advisor: epistemic register validation
      const lenses = {
        math: mathResult,
        environment: envReading,
        graph: graphHits,
      };
      const advisorResult = advisorValidate(lenses);

      // ── Orchestrator synthesis
      const synthesis = {
        foldId,
        hearthgate: APP_IDENTITY,
        anchor: { lat: anchor.lat, lon: anchor.lon, elevation: anchor.elevation ?? 0, label: anchor.label ?? null },
        analyzedAt: now.toISOString(),

        // Math lens — MATHEMATICAL_DERIVATION + LOCATION_INPUT
        mathematicalAnalysis: {
          registers: ['MATHEMATICAL_DERIVATION', 'LOCATION_INPUT'],
          locationState: locationState.map(round4),
          mappedCoordinate: mathResult.mapped.map(round4),
          convergenceScore: round4(mathResult.convergenceScore),
          foldSusceptibility: round4(mathResult.susceptibility),
          targetResidual: round4(mathResult.targetResidual),
          nearestPreimageDistance: round4(mathResult.nearestPreimageDistance),
          preimageDistances: mathResult.preimageDistances.map(round4),
          determinant: round4(mathResult.determinant),
          orientation: mathResult.orientation,
          localFoldProbability: mathResult.localFoldProbability,
          physicalFoldProbability: mathResult.physicalFoldProbability,
          physicalStatus: mathResult.physicalStatus,
          claimLabel: 'speculative-theory',
        },

        // Environment lens — PHYSICS_MODEL
        environmentAnalysis: {
          register: 'PHYSICS_MODEL',
          premaq: envReading.premaq,
          jspaceState: envReading.jspace?.state ?? null,
          jspaceClosestFiber: envReading.jspace?.closestFiberLabel ?? null,
          jspaceFiberDistances: envReading.jspace?.fiberDistances ?? null,
          foldWindows: envReading.foldWindows ?? null,
          confidence: envReading.confidence,
          claimLabel: 'speculative-theory',
        },

        // Graph lens — retrieved concepts
        graphAnalysis: {
          register: 'OBSERVATION',
          prompt: graphPrompt,
          retrievedNodes: graphHits.slice(0, 5).map(({ node, score }) => ({
            id: node.id,
            label: node.label,
            kind: node.kind,
            epistemicStatus: node.epistemicStatus,
            activationScore: Math.round(Math.min(1, score / 5) * 1000) / 1000,
          })),
        },

        // Advisor validation
        advisor: advisorResult,

        // Boundary
        boundary: 'det(J)=-2 everywhere: no mathematical fold singularity exists. Physical fold probability is null and uncalibrated. Convergence score measures proximity to certified preimage fibers — not a validated physical measurement.',
      };

      // Append to ledger (DR-003: JSONL = append-only history)
      await appendLedger({
        schema: 'hearthfire.fold-reading/v1',
        hearthgate: APP_IDENTITY,
        foldId,
        anchor: synthesis.anchor,
        convergenceScore: synthesis.mathematicalAnalysis.convergenceScore,
        foldSusceptibility: synthesis.mathematicalAnalysis.foldSusceptibility,
        advisorPassed: advisorResult.passed,
        advisorFlags: advisorResult.flags,
      });

      json(response, 200, { ok: true, synthesis }, request.method);
    } catch (err) {
      const tooLarge = err?.code === 'request-body-too-large';
      json(response, tooLarge ? 413 : 500, { ok: false, error: tooLarge ? 'request-body-too-large' : 'hearthgate-fold-error', details: err.message ?? String(err) }, request.method);
    }
    return;
  }

  if (path === '/api/hearthgate/ledger') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    try {
      const raw = await readFile(ledgerPath, 'utf8').catch(() => '');
      const entries = raw.trim().split('\n').filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      const limit = Math.min(Number(new URL(request.url, 'http://h').searchParams.get('limit') ?? 20), 100);
      json(response, 200, { ok: true, hearthgate: APP_IDENTITY, count: entries.length, entries: entries.slice(-limit) }, request.method);
    } catch (err) {
      json(response, 500, { ok: false, error: 'ledger-read-error', details: err.message }, request.method);
    }
    return;
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  if (path === '/api/rooms') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const rooms = await getAllRoomsWithAgents();
    json(response, 200, {
      ok: true,
      hearthgate: APP_IDENTITY,
      arkfireCanonicalLoop: 'Observe → Model → Interpret → Generate → Narrate → Evaluate → Record → Reobserve',
      count: rooms.length,
      rooms,
    }, request.method);
    return;
  }

  const roomMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
  if (roomMatch && request.method !== 'POST') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const room = await getRoomWithAgent(roomMatch[1]);
    if (!room) {
      json(response, 404, { ok: false, error: 'room-not-found', id: roomMatch[1] }, request.method);
      return;
    }
    json(response, 200, { ok: true, room }, request.method);
    return;
  }

  // ── Room chat dispatch ────────────────────────────────────────────────────
  // Each room dispatches to its canonical service. No room duplicates shared services.
  // Multi-agent: message is routed to the room's assignedAgent (configurable via Wizard).

  const roomChatMatch = path.match(/^\/api\/rooms\/([^/]+)\/chat$/);
  if (roomChatMatch) {
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const roomId = roomChatMatch[1];
    const room = await getRoomWithAgent(roomId);
    if (!room) {
      json(response, 404, { ok: false, error: 'room-not-found', id: roomId }, request.method);
      return;
    }

    let body;
    try { body = await readRequestJson(request); }
    catch (err) {
      const tooLarge = err?.code === 'request-body-too-large';
      json(response, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'request-body-too-large' : 'invalid-json' }, request.method);
      return;
    }

    const message = body.message ?? body.content ?? '';
    const dispatchedAt = new Date().toISOString();

    try {
      let roomResponse;

      if (roomId === 'science-centre') {
        // Science Centre → canonical fold/environment service
        const anchor = body.sanctumAnchor ?? await getSanctumAnchor();
        const anchorKey = _anchorKey(anchor);
        const now = Date.now();
        if (!_envCache || now - _envCache.fetchedAt > ENV_TTL_MS || _envCache.anchorKey !== anchorKey) {
          _envCache = { value: await fetchEnvironmentReading(anchor), fetchedAt: now, anchorKey };
        }
        const graphHits = message ? queryBM25(message, 6) : [];
        roomResponse = {
          centre: 'science-centre',
          environment: {
            premaq: _envCache.value.premaq,
            jspace: _envCache.value.jspace,
            confidence: _envCache.value.confidence,
            foldWindows: _envCache.value.foldWindows ?? null,
            locationDirectConvergence: _envCache.value.locationDirectConvergence ?? null,
          },
          graphContext: graphHits.slice(0, 4).map(({ node, score }) => ({
            id: node.id, label: node.label, kind: node.kind,
            epistemicStatus: node.epistemicStatus,
            activationScore: round4(Math.min(1, score / 5)),
          })),
          note: anchor ? null : 'Set a Sanctum Anchor via PUT /api/sanctum-anchor for location-direct analysis.',
        };

      } else if (roomId === 'temporal-centre') {
        // Temporal Centre → canonical ledger service
        const raw = await readFile(ledgerPath, 'utf8').catch(() => '');
        const allEntries = raw.trim().split('\n').filter(Boolean).map(line => {
          try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);

        // Accept log entry from body
        if (body.logEntry) {
          await appendLedger({ ...body.logEntry, room: 'temporal-centre', message });
        }

        const limit = Math.min(Number(body.limit ?? 20), 100);
        roomResponse = {
          centre: 'temporal-centre',
          ledgerCount: allEntries.length,
          recentEntries: allEntries.slice(-limit),
          temporalNote: message || null,
          arkfirePhases: room.arkfirePhases,
        };

      } else if (roomId === 'ingestion-centre') {
        // Ingestion Centre → canonical graph service (propose node from content)
        const content = body.content ?? body.message ?? '';
        const graphHits = content ? queryBM25(content, 8) : [];
        const proposedNode = content ? {
          id: `ingested-${Date.now()}`,
          kind: body.kind ?? 'ingested',
          label: body.label ?? content.slice(0, 60).replace(/\s+/g, ' ').trim(),
          description: content.slice(0, 500),
          worldId: body.worldId ?? 'earth',
          epistemicStatus: body.epistemicStatus ?? 'observation',
          properties: { ingestedAt: dispatchedAt, source: body.source ?? 'ingestion-centre', agentId: room.assignedAgent },
          attribution: body.attribution ?? null,
        } : null;
        roomResponse = {
          centre: 'ingestion-centre',
          proposedNode,
          relatedNodes: graphHits.slice(0, 6).map(({ node, score }) => ({
            id: node.id, label: node.label, kind: node.kind,
            epistemicStatus: node.epistemicStatus,
            activationScore: round4(Math.min(1, score / 5)),
          })),
          stewardNote: 'Graph proposals require Steward approval before commit. Use POST /api/graph (addNode) after review.',
        };

      } else if (roomId === 'continuity-centre') {
        // Continuity Centre → canonical graph + ledger (provenance and continuity state)
        const graphHits = message ? queryBM25(message, 10) : [];
        const raw = await readFile(ledgerPath, 'utf8').catch(() => '');
        const ledgerCount = raw.trim().split('\n').filter(Boolean).length;
        roomResponse = {
          centre: 'continuity-centre',
          graphContext: graphHits.slice(0, 8).map(({ node, score }) => ({
            id: node.id, label: node.label, kind: node.kind,
            epistemicStatus: node.epistemicStatus, worldId: node.worldId,
            activationScore: round4(Math.min(1, score / 5)),
          })),
          ledgerEntryCount: ledgerCount,
          arkfirePhases: room.arkfirePhases,
          note: 'Continuity state is the knowledge graph + action ledger. Query graph via /api/graph/query.',
        };

      } else if (roomId === 'hearthfire') {
        // Hearthfire → work context: BM25 on implementation nodes, routing for code tasks
        const graphHits = message ? queryBM25(message, 8) : [];
        roomResponse = {
          centre: 'hearthfire',
          workContext: {
            assignedAgent: room.assignedAgent,
            capabilities: room.capabilities,
            arkfirePhases: room.arkfirePhases,
          },
          graphContext: graphHits.slice(0, 6).map(({ node, score }) => ({
            id: node.id, label: node.label, kind: node.kind,
            epistemicStatus: node.epistemicStatus,
            activationScore: round4(Math.min(1, score / 5)),
          })),
          note: 'LLM agent dispatch reserved for future editions. Deterministic routing active.',
        };

      } else if (roomId === 'grove') {
        // Grove → narrative context: BM25 on mythic/narrative nodes
        const graphHits = message
          ? queryBM25(message, 8, {})
          : queryBM25('narrative dream world grove', 6);
        roomResponse = {
          centre: 'grove',
          narrativeContext: {
            assignedAgent: room.assignedAgent,
            capabilities: room.capabilities,
            arkfirePhases: room.arkfirePhases,
          },
          graphContext: graphHits.slice(0, 6).map(({ node, score }) => ({
            id: node.id, label: node.label, kind: node.kind,
            epistemicStatus: node.epistemicStatus, worldId: node.worldId,
            activationScore: round4(Math.min(1, score / 5)),
          })),
          note: 'LLM agent dispatch reserved for future editions. Deterministic routing active.',
        };

      } else if (roomId === 'hall') {
        // The Hall → group gathering space: cross-cutting BM25 on all nodes, constellation presence
        const graphHits = message
          ? queryBM25(message, 12)
          : queryBM25('gathering group shared constellation presence', 8);
        const allRooms = await getAllRoomsWithAgents();
        roomResponse = {
          centre: 'hall',
          presence: allRooms.map(r => ({ room: r.id, agent: r.assignedAgent, arkfirePhases: r.arkfirePhases })),
          graphContext: graphHits.slice(0, 10).map(({ node, score }) => ({
            id: node.id, label: node.label, kind: node.kind,
            epistemicStatus: node.epistemicStatus, worldId: node.worldId,
            activationScore: round4(Math.min(1, score / 5)),
          })),
          note: 'The hall is open to all constellation members. Group sessions and shared context available here.',
          arkfirePhases: room.arkfirePhases,
        };

      } else {
        roomResponse = { centre: roomId, note: 'Room handler not yet implemented.' };
      }

      json(response, 200, {
        ok: true,
        roomId,
        roomName: room.name,
        assignedAgent: room.assignedAgent,
        dispatchedAt,
        message: message || null,
        response: roomResponse,
      }, request.method);

    } catch (err) {
      json(response, 500, { ok: false, error: 'room-dispatch-error', details: err.message ?? String(err) }, request.method);
    }
    return;
  }

  // ── Wizard ────────────────────────────────────────────────────────────────

  if (path === '/api/wizard') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    json(response, 200, {
      ok: true,
      hearthgate: APP_IDENTITY,
      description: 'Configuration and extension governor. Assigns agents to rooms, installs/removes modules, manages providers, permissions, memory scopes, and world access.',
      routes: {
        config: 'GET/PUT /api/wizard/config',
        constellation: 'GET /api/wizard/constellation',
        modules: 'GET /api/hearthgate/modules',
        rooms: 'GET /api/rooms',
      },
      moduleManifestSchema: MODULE_MANIFEST_SCHEMA,
    }, request.method);
    return;
  }

  if (path === '/api/wizard/config') {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const cfg = await loadWizardConfig();
      json(response, 200, { ok: true, config: cfg }, request.method);
      return;
    }
    if (request.method === 'PUT') {
      try {
        const body = await readRequestJson(request);
        // Only allow updating roomAgents and customModules — schema and updatedAt are managed here
        const patch = {};
        if (body.roomAgents && typeof body.roomAgents === 'object') patch.roomAgents = body.roomAgents;
        if (Array.isArray(body.customModules)) patch.customModules = body.customModules;
        const updated = await saveWizardConfig(patch);
        json(response, 200, { ok: true, config: updated }, request.method);
      } catch (err) {
        const tooLarge = err?.code === 'request-body-too-large';
        const unknownRoom = err?.code === 'unknown-room';
        json(response, tooLarge ? 413 : unknownRoom ? 400 : 500, {
          ok: false, error: tooLarge ? 'request-body-too-large' : unknownRoom ? 'unknown-room' : 'wizard-config-error',
          details: err.message,
        }, request.method);
      }
      return;
    }
    json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
    return;
  }

  if (path === '/api/wizard/constellation') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const cfg = await loadWizardConfig();
    const constellationWithRuntime = activeAgentRegistry.map(agent => {
      const runtime = cfg.agentConfigs?.[agent.id] ?? { status: 'not-started' };
      return {
        ...agent,
        // Override static status with live runtime status from Wizard config
        status: runtime.status ?? agent.status,
        runtimeConfig: runtime,
        assignedRooms: Object.entries(cfg.roomAgents)
          .filter(([, agentId]) => agentId === agent.id)
          .map(([roomId]) => roomId),
      };
    });
    const activeCount = constellationWithRuntime.filter(a => a.status === 'active').length;
    json(response, 200, {
      ok: true,
      hearthgate: APP_IDENTITY,
      activeCount,
      totalConstellation: activeAgentRegistry.length,
      agents: constellationWithRuntime,
    }, request.method);
    return;
  }

  // ── Wizard: per-agent routes ──────────────────────────────────────────────

  const constellationAgentMatch = path.match(/^\/api\/wizard\/constellation\/([^/]+)$/);
  if (constellationAgentMatch) {
    const agentId = constellationAgentMatch[1];
    if (!AGENT_IDS.includes(agentId)) {
      json(response, 404, { ok: false, error: 'agent-not-found', agentId }, request.method);
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const staticDef = activeAgentRegistry.find(a => a.id === agentId);
      const runtime = await getAgentRuntimeConfig(agentId);
      json(response, 200, {
        ok: true,
        agent: { ...staticDef, status: runtime.status ?? staticDef.status, runtimeConfig: runtime },
      }, request.method);
      return;
    }
    json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
    return;
  }

  const agentStartMatch = path.match(/^\/api\/wizard\/constellation\/([^/]+)\/(start|stop)$/);
  if (agentStartMatch) {
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const agentId = agentStartMatch[1];
    const action = agentStartMatch[2];
    if (!AGENT_IDS.includes(agentId)) {
      json(response, 404, { ok: false, error: 'agent-not-found', agentId }, request.method);
      return;
    }
    try {
      let body = {};
      try { body = await readRequestJson(request); } catch { /* optional body */ }
      let updatedCfg;
      if (action === 'start') {
        updatedCfg = await startAgent(agentId, {
          provider: body.provider ?? null,
          model: body.model ?? null,
          memoryScope: body.memoryScope ?? null,
          worldAccess: body.worldAccess ?? null,
        });
      } else {
        updatedCfg = await stopAgent(agentId);
      }
      const runtime = updatedCfg.agentConfigs?.[agentId] ?? {};
      const staticDef = activeAgentRegistry.find(a => a.id === agentId);
      json(response, 200, {
        ok: true,
        action,
        agent: { ...staticDef, status: runtime.status, runtimeConfig: runtime },
      }, request.method);
    } catch (err) {
      json(response, 500, { ok: false, error: 'agent-lifecycle-error', details: err.message }, request.method);
    }
    return;
  }

  // ── Hearthgate: Module discovery ─────────────────────────────────────────

  if (path === '/api/hearthgate/modules') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const modules = await loadModuleManifests();
    json(response, 200, {
      ok: true,
      hearthgate: APP_IDENTITY,
      count: modules.length,
      modules,
    }, request.method);
    return;
  }

  const moduleMatch = path.match(/^\/api\/hearthgate\/modules\/([^/]+)$/);
  if (moduleMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const modules = await loadModuleManifests();
    const mod = modules.find((m) => m.id === moduleMatch[1]);
    if (!mod) {
      json(response, 404, { ok: false, error: 'module-not-found', id: moduleMatch[1] }, request.method);
      return;
    }
    json(response, 200, { ok: true, module: mod }, request.method);
    return;
  }

  // ── Hearthgate: Agent & contributor registry ──────────────────────────────

  if (path === '/api/hearthgate/registry') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    json(response, 200, {
      ok: true,
      hearthgate: APP_IDENTITY,
      arkfireCanonicalLoop: 'Observe → Model → Interpret → Generate → Narrate → Evaluate → Record → Reobserve',
      activeAgentRegistry,
      contributorAttributionRegistry,
    }, request.method);
    return;
  }

  // ── Graph routes ─────────────────────────────────────────────────────────

  if (path === '/api/graph') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    json(response, 200, { ok: true, stats: graphStats() }, request.method);
    return;
  }

  if (path === '/api/graph/query') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const q = requestUrl.searchParams.get('q') ?? '';
    const k = Math.min(Number(requestUrl.searchParams.get('k') ?? 15), 50);
    const world = requestUrl.searchParams.get('world') ?? null;
    const kind = requestUrl.searchParams.get('kind') ?? null;
    if (!q.trim()) {
      json(response, 400, { ok: false, error: 'q-required' }, request.method);
      return;
    }
    const filter = {};
    if (world) filter.worldId = world;
    if (kind) filter.kind = kind;
    const results = queryBM25(q, k, filter);
    json(response, 200, { ok: true, query: q, count: results.length, results }, request.method);
    return;
  }

  const graphNodeMatch = path.match(/^\/api\/graph\/node\/([^/]+)$/);
  if (graphNodeMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    const node = getNode(decodeURIComponent(graphNodeMatch[1]));
    if (!node) {
      json(response, 404, { ok: false, error: 'node-not-found' }, request.method);
      return;
    }
    const edges = getEdges(node.id, 'both');
    json(response, 200, { ok: true, node, edges }, request.method);
    return;
  }

  if (path === '/api/graph/traverse') {
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    try {
      const body = await readRequestJson(request);
      if (!body.nodeId) {
        json(response, 400, { ok: false, error: 'nodeId-required' }, request.method);
        return;
      }
      const maxHops = Math.min(body.maxHops ?? 3, 6);
      const result = traverse(body.nodeId, body.relation ?? null, maxHops);
      json(response, 200, { ok: true, ...result, nodeCount: result.nodes.length, edgeCount: result.edges.length }, request.method);
    } catch (err) {
      const tooLarge = err?.code === 'request-body-too-large';
      json(response, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'request-body-too-large' : 'traverse-error' }, request.method);
    }
    return;
  }

  if (path === '/api/observer/workspace') {
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    try {
      const body = await readRequestJson(request);
      if (!body.prompt || typeof body.prompt !== 'string') {
        json(response, 400, { ok: false, error: 'prompt-required', details: 'body.prompt must be a non-empty string' }, request.method);
        return;
      }

      // Fetch environment reading for externalJspace (cached)
      const anchor = await getSanctumAnchor();
      const anchorKey = _anchorKey(anchor);
      const now = Date.now();
      if (!_envCache || now - _envCache.fetchedAt > ENV_TTL_MS || _envCache.anchorKey !== anchorKey) {
        _envCache = { value: await fetchEnvironmentReading(anchor), fetchedAt: now, anchorKey };
      }
      const envReading = _envCache.value;

      // Attempt jlens workspace readout (optional — degrades gracefully)
      let modelWorkspace = { available: false };
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), JLENS_TIMEOUT_MS);
        const jlensRes = await fetch(`${JLENS_BASE}/workspace`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: body.prompt,
            layers: body.layers ?? null,
            top_k: body.topK ?? 10,
            positions: body.positions ?? [-1],
          }),
          signal: ctrl.signal,
        }).finally(() => clearTimeout(timer));

        if (jlensRes.ok) {
          const jlensData = await jlensRes.json();
          if (jlensData.workspace_available) {
            const topConcepts = (jlensData.top_concepts ?? []).map((c) => ({
              token: c.token,
              rank: c.rank,
              layer: c.layer,
              position: c.position,
            }));
            modelWorkspace = {
              available: true,
              model: jlensData.model,
              lensVersion: jlensData.lens_version,
              workspaceBand: jlensData.workspace_band,
              topConcepts,
              crossChecked: false,
              divergences: [],
            };
          } else {
            modelWorkspace = { available: false, error: jlensData.error };
          }
        }
      } catch (_jlensErr) {
        modelWorkspace = { available: false, error: 'jlens-service-unavailable' };
      }

      const workspaceId = randomUUID();

      // BM25 retrieval — populate active nodes
      const topK = Math.min(body.topNodes ?? 15, 20);
      const bm25Results = queryBM25(body.prompt, topK);
      const activeNodeIds = new Set(bm25Results.map(r => r.node.id));

      // Include world nodes for any worlds in scope
      const worldsInScope = body.worlds ?? ['earth'];
      for (const wId of worldsInScope) {
        const wNode = getNode(`world-${wId}`);
        if (wNode && activeNodeIds.size < 20) activeNodeIds.add(wNode.id);
      }

      const activeNodes = bm25Results.map(({ node, score }) => ({
        nodeId: node.id,
        label: node.label,
        kind: node.kind,
        worldId: node.worldId,
        activationScore: Math.min(1, score / 5),  // normalize roughly to 0-1
        retrievedBy: 'bm25',
        epistemicStatus: node.epistemicStatus,
      }));

      // Include world nodes not already in results
      for (const wId of worldsInScope) {
        const nodeId = `world-${wId}`;
        if (!activeNodeIds.has(nodeId)) {
          const wNode = getNode(nodeId);
          if (wNode) {
            activeNodes.push({ nodeId, label: wNode.label, kind: 'world', worldId: wNode.worldId, activationScore: 0.5, retrievedBy: 'world-scope', epistemicStatus: wNode.epistemicStatus });
            activeNodeIds.add(nodeId);
          }
        }
      }

      // Find edges between active nodes
      const activeEdges = [];
      const seenEdgeKeys = new Set();
      for (const nodeId of activeNodeIds) {
        for (const edge of getEdges(nodeId, 'out')) {
          if (activeNodeIds.has(edge.toId)) {
            const key = `${edge.fromId}|${edge.relation}|${edge.toId}`;
            if (!seenEdgeKeys.has(key)) {
              seenEdgeKeys.add(key);
              activeEdges.push({ fromId: edge.fromId, toId: edge.toId, relation: edge.relation, weight: edge.weight ?? 1 });
            }
          }
        }
      }

      const workspace = {
        schema: 'hearthfire.jspace-workspace/v1',
        workspaceId,
        query: body.prompt,
        activeWorlds: worldsInScope,
        activeNodes,
        activeEdges,
        externalJspace: {
          state: envReading.jspace?.state ?? [0, 0, 0],
          closestFiber: envReading.jspace?.closestFiber ?? 0,
          closestFiberLabel: envReading.jspace?.closestFiberLabel ?? 'earth-p1',
          fiberDistances: envReading.jspace?.fiberDistances ?? [0, 0, 0],
          premaqSnapshot: envReading.premaq,
          claimLabel: 'speculative-theory',
        },
        modelWorkspace,
        createdAt: new Date().toISOString(),
      };

      json(response, 200, { ok: true, workspace }, request.method);
    } catch (err) {
      const tooLarge = err?.code === 'request-body-too-large';
      json(response, tooLarge ? 413 : 500, {
        ok: false,
        error: tooLarge ? 'request-body-too-large' : 'workspace-error',
        details: err.message ?? String(err),
      }, request.method);
    }
    return;
  }

  if (path === '/api/concordance/schema') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    json(response, 200, concordanceSchema(), request.method);
    return;
  }

  if (path === '/api/concordance/evaluate') {
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }

    try {
      const body = await readRequestJson(request);
      const reading = evaluateConcordance(body.vector || body, body.provenance || {});
      json(response, 200, reading, request.method);
    } catch (error) {
      const tooLarge = error?.code === 'request-body-too-large';
      const invalidVector = error?.code === 'invalid-concordance-vector';
      json(response, tooLarge ? 413 : 400, {
        ok: false,
        error: tooLarge ? 'request-body-too-large' : invalidVector ? error.code : 'invalid-json-or-vector',
        details: error?.details || null,
      }, request.method);
    }
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, host, () => {
  console.log(`STARWELL is listening at http://${host}:${port}`);
  console.log('Framework: REI Mythience');
  console.log('Concordance Engine: 0.2.0');
});

function close(signal) {
  console.log(`${signal} received; banking the Hearthfire.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => close('SIGINT'));
process.on('SIGTERM', () => close('SIGTERM'));
