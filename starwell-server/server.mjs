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
import { dispatchRoom, dispatchHallChorus, CONSTELLATION } from './arkfire-dispatch.mjs';
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

// Coherence snapshot — PREMAQ values stamped on every message and ingested item.
// Uses cached reading when fresh; fetches if stale or absent.
async function _coherenceSnapshot(anchor) {
  const anchorKey = _anchorKey(anchor);
  const now = Date.now();
  if (!_envCache || now - _envCache.fetchedAt > ENV_TTL_MS || _envCache.anchorKey !== anchorKey) {
    try {
      _envCache = { value: await fetchEnvironmentReading(anchor), fetchedAt: now, anchorKey };
    } catch {
      // Return a null snapshot rather than blocking the message
      return null;
    }
  }
  const p = _envCache.value?.premaq;
  const sc = _envCache.value?.sheetConvergence ?? null;
  if (!p) return null;
  return {
    pulse:       round4(p.pulse       ?? 0),
    coherence:   round4(p.coherence   ?? 0),
    resonance:   round4(p.resonance   ?? 0),
    entropy:     round4(p.entropy     ?? 0),
    convergence: sc !== null ? round4(sc) : null,
    sampledAt:   new Date().toISOString(),
  };
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
