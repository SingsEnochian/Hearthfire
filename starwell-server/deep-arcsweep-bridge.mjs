import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDeepArcsweepPacket, validateDeepArcsweepPacket } from './deep-spine-contract.mjs';
import { getArcsweepWorldAnchorIndex, resolveArcsweepWorldAnchor } from './arcsweep-world-context.mjs';
import { formatYggdrasilDeepContext } from './yggdrasil-deep-context.mjs';
import { dispatchMemberMode } from './arkfire-dispatch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, 'data');
const latestPath = process.env.DEEP_ARCSWEEP_LATEST_PATH || resolve(dataDir, 'deep-arcsweep.latest.json');
const ledgerPath = process.env.DEEP_ARCSWEEP_LEDGER_PATH || resolve(dataDir, 'deep-arcsweep-ledger.jsonl');
const host = process.env.DEEP_ARCSWEEP_HOST || '127.0.0.1';
const port = Number(process.env.DEEP_ARCSWEEP_PORT || 4182);
const hearthfireBase = process.env.HEARTHFIRE_BASE_URL || 'http://127.0.0.1:4173';
const MAX_BODY_BYTES = 256 * 1024;

async function readJsonRequest(request) {
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
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function respond(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function collectHearthfireRuntime(body) {
  if (!body.fetchRuntime) return {};
  const runtime = {};

  try {
    const environment = await fetchJson(`${hearthfireBase}/api/observer/environment`);
    runtime.environmentReading = environment.reading ?? null;
  } catch (error) {
    runtime.environmentError = error.message;
  }

  if (body.sanctumAnchor) {
    try {
      const fold = await fetchJson(`${hearthfireBase}/api/hearthgate/fold`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sanctumAnchor: body.sanctumAnchor, intent: body.intent ?? null }),
      });
      runtime.mathematicalAnalysis = fold.synthesis?.mathematicalAnalysis ?? null;
      runtime.graphContext = fold.synthesis?.graphAnalysis?.retrievedNodes ?? [];
    } catch (error) {
      runtime.foldError = error.message;
    }
  }

  return runtime;
}

async function persistPacket(packet) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(latestPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  await appendFile(ledgerPath, `${JSON.stringify(packet)}\n`, 'utf8');
}

export async function loadLatestDeepArcsweepPacket() {
  try {
    const packet = JSON.parse(await readFile(latestPath, 'utf8'));
    return validateDeepArcsweepPacket(packet).valid ? packet : null;
  } catch {
    return null;
  }
}

export async function bindDeepToArcsweep(body = {}) {
  const worldKey = body.world ?? body.worldSlug ?? body.notionPageId;
  const worldAnchor = await resolveArcsweepWorldAnchor(worldKey);
  if (!worldAnchor) {
    const error = new Error(`Unknown Arcsweep world anchor: ${worldKey ?? 'missing'}`);
    error.code = 'world-not-found';
    throw error;
  }

  const runtime = await collectHearthfireRuntime(body);
  const packet = buildDeepArcsweepPacket({
    worldAnchor,
    deep: body.deep ?? {},
    environmentReading: body.environmentReading ?? runtime.environmentReading ?? null,
    mathematicalAnalysis: body.mathematicalAnalysis ?? runtime.mathematicalAnalysis ?? null,
    graphContext: body.graphContext ?? runtime.graphContext ?? [],
    intent: body.intent ?? null,
    sourceRefs: body.sourceRefs ?? [],
    consentScope: body.consentScope ?? 'local-only',
    privacyScope: body.privacyScope ?? 'private_local',
  });

  await persistPacket(packet);
  return {
    packet,
    runtimeWarnings: [runtime.environmentError, runtime.foldError].filter(Boolean),
  };
}

export function buildYggdrasilBridgeMessage(packet, message) {
  const operationalContext = formatYggdrasilDeepContext(packet);
  const userMessage = String(message ?? 'Read and route the current DEEP Arcsweep packet.');
  return `${operationalContext}\n\n---\n\n# Steward Request\n${userMessage}`;
}

export function startDeepArcsweepBridgeServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${host}:${port}`);

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        const latest = await loadLatestDeepArcsweepPacket();
        respond(response, 200, {
          ok: true,
          module: 'deep-arcsweep-bridge',
          schema: 'hearthgate.module/v1',
          latestPacket: latest ? { packetId: latest.packetId, sampledAt: latest.sampledAt, world: latest.worldAnchor.slug } : null,
          hearthfireAdapter: hearthfireBase,
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/worlds') {
        const index = await getArcsweepWorldAnchorIndex();
        respond(response, 200, { ok: true, registry: index?.notion_registry ?? null, worlds: index?.worlds ?? [] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/latest') {
        const packet = await loadLatestDeepArcsweepPacket();
        respond(response, packet ? 200 : 404, packet ? { ok: true, packet } : { ok: false, error: 'no-packet' });
        return;
      }

      if (request.method === 'POST' && (url.pathname === '/bind' || url.pathname === '/yggdrasil')) {
        const body = await readJsonRequest(request);
        const binding = await bindDeepToArcsweep(body);

        if (url.pathname === '/bind') {
          respond(response, 200, { ok: true, ...binding });
          return;
        }

        const message = buildYggdrasilBridgeMessage(
          binding.packet,
          body.message ?? body.intent ?? 'Read and route the current DEEP Arcsweep packet.',
        );
        const mode = body.mode ?? 'worldStructure';
        const history = Array.isArray(body.history) ? body.history : [];
        const yggdrasil = await dispatchMemberMode('yggdrasil', mode, message, history);
        respond(response, yggdrasil.ok ? 200 : 503, { ok: yggdrasil.ok, ...binding, yggdrasil });
        return;
      }

      respond(response, 404, { ok: false, error: 'route-not-found' });
    } catch (error) {
      const status = error.code === 'request-body-too-large' ? 413
        : error.code === 'world-not-found' || error.code === 'world-anchor-required' ? 400
          : 500;
      respond(response, status, { ok: false, error: error.code ?? 'bridge-error', details: error.message });
    }
  });

  server.listen(port, host, () => {
    console.log(`DEEP × Arcsweep bridge listening at http://${host}:${port}`);
  });
  return server;
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntrypoint) startDeepArcsweepBridgeServer();
