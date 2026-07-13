import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(__dirname, 'public');
const reiManifestPath = resolve(__dirname, 'rei-mythience.manifest.json');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';
const startedAt = Date.now();

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
  });
  if (requestMethod === 'HEAD') response.end();
  else response.end(JSON.stringify(body));
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const requested = decoded === '/' ? '/index.html' : decoded;
  const candidate = resolve(publicRoot, `.${normalize(requested)}`);
  return candidate.startsWith(publicRoot) ? candidate : null;
}

async function serveStatic(request, response) {
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
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      if (request.method === 'HEAD') response.end();
      else response.end(fallback);
    } catch {
      json(response, 404, { ok: false, error: 'place-not-found' }, request.method);
    }
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
    return;
  }

  if (request.url?.startsWith('/health')) {
    json(response, 200, {
      ok: true,
      place: 'STARWELL within Hearthfire',
      framework: 'REI Mythience',
      runtime: process.version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    }, request.method);
    return;
  }

  if (request.url?.startsWith('/api/state')) {
    json(response, 200, {
      schema: 'hearthfire.place-state/v1',
      place: 'starwell',
      hostPlace: 'hearthfire',
      centre: 'hearth',
      framework: 'rei-mythience',
      frameworkRoute: '/api/rei',
      rooms: ['observatory', 'library', 'grove', 'workshop', 'atlas'],
      consent: 'user-invoked',
      persistence: 'device-local',
    }, request.method);
    return;
  }

  if (request.url?.startsWith('/api/rei')) {
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

  await serveStatic(request, response);
});

server.listen(port, host, () => {
  console.log(`STARWELL is listening at http://${host}:${port}`);
  console.log('Framework: REI Mythience');
});

function close(signal) {
  console.log(`${signal} received; banking the Hearthfire.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', () => close('SIGINT'));
process.on('SIGTERM', () => close('SIGTERM'));
