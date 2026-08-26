import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleProjectZeroRoute } from './project-zero-router.mjs';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const upstreamHost = process.env.STARWELL_UPSTREAM_HOST || '127.0.0.1';
const upstreamPort = Number(process.env.STARWELL_UPSTREAM_PORT || port + 1);
const serverPath = fileURLToPath(new URL('./server.mjs', import.meta.url));

function json(response, status, body, requestMethod = 'GET') {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (requestMethod === 'HEAD') response.end();
  else response.end(JSON.stringify(body));
}

function proxy(request, response) {
  const upstream = fetch(`http://${upstreamHost}:${upstreamPort}${request.url || '/'}`, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request,
    duplex: request.method === 'GET' || request.method === 'HEAD' ? undefined : 'half',
  });

  upstream.then(async (result) => {
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    if (request.method === 'HEAD' || !result.body) {
      response.end();
      return;
    }
    for await (const chunk of result.body) response.write(chunk);
    response.end();
  }).catch((error) => {
    json(response, 502, {
      ok: false,
      error: 'starwell-upstream-unavailable',
      message: error instanceof Error ? error.message : String(error),
    }, request.method);
  });
}

const upstream = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: upstreamHost,
    PORT: String(upstreamPort),
  },
});

const server = createServer(async (request, response) => {
  const path = new URL(request.url || '/', 'http://hearthfire.local').pathname;
  if (await handleProjectZeroRoute({ path, request, response, json })) return;
  proxy(request, response);
});

server.listen(port, host, () => {
  console.log(`STARWELL compatibility front-controller listening at http://${host}:${port}`);
  console.log(`STARWELL upstream listening at http://${upstreamHost}:${upstreamPort}`);
});

function close(signal) {
  upstream.kill(signal);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

upstream.on('exit', (code, signal) => {
  if (code === 0 || signal) return;
  console.error(`STARWELL upstream exited unexpectedly with code ${code}`);
  process.exit(code || 1);
});

process.on('SIGINT', () => close('SIGINT'));
process.on('SIGTERM', () => close('SIGTERM'));
