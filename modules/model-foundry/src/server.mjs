import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { probeProviders } from './ollama.mjs';
import { RegistryStore, validateRegistry } from './store.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicRoot = join(moduleRoot, 'public');
const manifestPath = join(moduleRoot, 'arkfire.module.json');
const MAX_BODY_BYTES = 512 * 1024;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function setCommonHeaders(response) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
}

function sendJson(response, statusCode, body, method = 'GET', extraHeaders = {}) {
  setCommonHeaders(response);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  if (method === 'HEAD') response.end();
  else response.end(`${JSON.stringify(body, null, 2)}\n`);
}

async function readRequestJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('request-body-too-large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('invalid-json');
    error.statusCode = 400;
    throw error;
  }
}

function safePublicPath(pathname) {
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const candidate = resolve(publicRoot, `.${normalize(requested)}`);
  return candidate.startsWith(publicRoot) ? candidate : null;
}

async function serveStatic(request, response, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  const filePath = safePublicPath(pathname);
  if (!filePath) {
    sendJson(response, 403, { ok: false, error: 'path-denied' }, request.method);
    return true;
  }
  try {
    const fileStat = await stat(filePath);
    const resolvedPath = fileStat.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(resolvedPath);
    setCommonHeaders(response);
    response.setHeader('cache-control', extname(resolvedPath) === '.html' ? 'no-cache' : 'public, max-age=300');
    response.writeHead(200, { 'content-type': contentTypes[extname(resolvedPath)] || 'application/octet-stream' });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
    return true;
  } catch {
    return false;
  }
}

async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function errorBody(error) {
  return {
    ok: false,
    error: error?.message || 'unexpected-error',
  };
}

export async function startFoundryServer({
  host = process.env.HOST || '127.0.0.1',
  port = Number(process.env.PORT || 4387),
  dataDirectory = null,
  logger = console,
} = {}) {
  const store = new RegistryStore(dataDirectory);
  await store.init();
  const startedAt = Date.now();

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`);
    const pathname = requestUrl.pathname;

    try {
      if (pathname === '/health') {
        if (!['GET', 'HEAD'].includes(request.method)) {
          sendJson(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
          return;
        }
        const registry = await store.init();
        const enabledProviders = registry.providers.filter((provider) => provider.enabled);
        const availableProviders = enabledProviders.filter((provider) => provider.lastHealth?.status === 'available');
        sendJson(response, 200, {
          ok: true,
          moduleId: 'arkfire.models',
          canonicalName: 'Arkfire Model Foundry',
          version: '0.1.0',
          status: 'PARTIAL',
          runtime: 'standalone',
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          dataDirectory: store.dataDirectory,
          providers: {
            configured: registry.providers.length,
            enabled: enabledProviders.length,
            available: availableProviders.length,
          },
        }, request.method);
        return;
      }

      if (pathname === '/.well-known/arkfire-module' || pathname === '/arkfire/module') {
        if (!['GET', 'HEAD'].includes(request.method)) {
          sendJson(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
          return;
        }
        sendJson(response, 200, await loadManifest(), request.method);
        return;
      }

      if (pathname === '/api/registry') {
        if (request.method === 'GET' || request.method === 'HEAD') {
          sendJson(response, 200, { ok: true, registry: await store.init() }, request.method);
          return;
        }
        if (request.method === 'PUT') {
          const body = await readRequestJson(request);
          const registry = validateRegistry(body.registry ?? body);
          sendJson(response, 200, { ok: true, registry: await store.writeRegistry(registry) }, request.method);
          return;
        }
        sendJson(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }

      if (pathname === '/api/providers' && request.method === 'POST') {
        const body = await readRequestJson(request);
        const registry = await store.upsertProvider(body.provider ?? body);
        sendJson(response, 200, { ok: true, registry }, request.method);
        return;
      }

      if (pathname.startsWith('/api/providers/') && request.method === 'DELETE') {
        const providerId = decodeURIComponent(pathname.slice('/api/providers/'.length));
        if (!providerId) {
          sendJson(response, 400, { ok: false, error: 'providerId-required' }, request.method);
          return;
        }
        const result = await store.removeProvider(providerId);
        sendJson(response, result.removed ? 200 : 404, { ok: result.removed, ...result }, request.method);
        return;
      }

      if (pathname === '/api/probe' && request.method === 'POST') {
        const body = await readRequestJson(request);
        const registry = await store.init();
        const providerIds = Array.isArray(body.providerIds) ? new Set(body.providerIds.map(String)) : null;
        const selected = providerIds
          ? registry.providers.filter((provider) => providerIds.has(provider.providerId))
          : registry.providers;
        const timeoutMs = Math.min(30_000, Math.max(1_000, Number(body.timeoutMs || 5_000)));
        const results = await probeProviders(selected, { timeoutMs });
        const updatedRegistry = body.persist === false ? registry : await store.applyProbeResults(results);
        sendJson(response, 200, {
          ok: true,
          probedAt: new Date().toISOString(),
          results,
          registry: updatedRegistry,
        }, request.method);
        return;
      }

      if (pathname === '/api/export' && ['GET', 'HEAD'].includes(request.method)) {
        const bundle = await store.exportBundle();
        const filename = `arkfire-model-foundry-${new Date().toISOString().slice(0, 10)}.json`;
        sendJson(response, 200, bundle, request.method, {
          'content-disposition': `attachment; filename="${filename}"`,
        });
        return;
      }

      if (pathname === '/api/import' && request.method === 'POST') {
        const body = await readRequestJson(request);
        const registry = await store.importBundle(body.bundle ?? body);
        sendJson(response, 200, { ok: true, registry }, request.method);
        return;
      }

      if (pathname.startsWith('/api/') || pathname.startsWith('/arkfire/')) {
        sendJson(response, 404, { ok: false, error: 'route-not-found' }, request.method);
        return;
      }

      if (await serveStatic(request, response, pathname)) return;
      sendJson(response, 404, { ok: false, error: 'not-found' }, request.method);
    } catch (error) {
      const statusCode = Number(error?.statusCode || (error instanceof TypeError ? 400 : 500));
      if (statusCode >= 500) logger.error?.('[ModelFoundry]', error);
      sendJson(response, statusCode, errorBody(error), request.method);
    }
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, host, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });

  const address = server.address();
  const boundHost = typeof address === 'object' && address ? address.address : host;
  const boundPort = typeof address === 'object' && address ? address.port : port;
  const displayHost = ['0.0.0.0', '::'].includes(boundHost) ? '127.0.0.1' : boundHost;
  const url = `http://${displayHost.includes(':') ? `[${displayHost}]` : displayHost}:${boundPort}`;

  return {
    server,
    store,
    host: boundHost,
    port: boundPort,
    url,
    async close() {
      await new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => error ? rejectPromise(error) : resolvePromise());
      });
    },
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const runtime = await startFoundryServer();
  console.log(`Arkfire Model Foundry listening at ${runtime.url}`);
  console.log(`Data directory: ${runtime.store.dataDirectory}`);

  const stop = async () => {
    await runtime.close().catch(() => {});
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
