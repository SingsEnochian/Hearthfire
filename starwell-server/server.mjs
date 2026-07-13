import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { concordanceSchema, evaluateConcordance } from './public/concordance-engine.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(__dirname, 'public');
const reiManifestPath = resolve(__dirname, 'rei-mythience.manifest.json');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const startedAt = Date.now();
const MAX_BODY_BYTES = 32 * 1024;

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
    json(response, 200, {
      ok: true,
      place: 'STARWELL within Hearthfire',
      framework: 'REI Mythience',
      concordanceEngine: '0.2.0',
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
