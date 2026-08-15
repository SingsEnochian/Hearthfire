#!/usr/bin/env node

import { createServer } from 'node:http';
import { resolve } from 'node:path';
import {
  LaminationEngine,
  runLaminatedVerticalSlice,
} from './src/bridge-lamination.mjs';

function parseArgs(argv) {
  const [command = 'health', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = rest[index + 1]?.startsWith('--') ? true : rest[++index] ?? true;
    options[key] = value;
  }
  return { command, options };
}

function runtimeOptions(options) {
  return {
    worldSlug: String(options.world ?? 'terra-aeterna'),
    canonAuthority: String(options.canon ?? 'notion://terra-aeterna'),
    realityAnchor: String(options.anchor ?? 'current-reality://hearthside'),
    arrivalContext: options.arrival
      ? { description: String(options.arrival), resolution: 'manual' }
      : null,
    dataDirectory: resolve(String(options.data ?? './data')),
    loader: String(options.loader ?? 'manual'),
  };
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runHealth(options) {
  const runtime = runtimeOptions(options);
  const engine = new LaminationEngine({ dataDirectory: runtime.dataDirectory });
  writeJson(await engine.health());
}

async function runDemo(options) {
  writeJson(await runLaminatedVerticalSlice(runtimeOptions(options)));
}

async function runLatest(options) {
  const runtime = runtimeOptions(options);
  const engine = new LaminationEngine({ dataDirectory: runtime.dataDirectory });
  writeJson(await engine.latest());
}

async function runReplay(options) {
  const runtime = runtimeOptions(options);
  const engine = new LaminationEngine({ dataDirectory: runtime.dataDirectory });
  writeJson(await engine.replay());
}

async function runServer(options) {
  const runtime = runtimeOptions(options);
  const port = Number(options.port ?? process.env.PORT ?? 4318);
  const host = String(options.host ?? process.env.HOST ?? '127.0.0.1');
  const engine = new LaminationEngine({ dataDirectory: runtime.dataDirectory });

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');

    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify(await engine.health()));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/lamination/latest') {
      response.writeHead(200);
      response.end(JSON.stringify(await engine.latest()));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/laminations') {
      response.writeHead(200);
      response.end(JSON.stringify(await engine.replay()));
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ ok: false, error: 'route-not-found' }));
  });

  server.listen(port, host, () => {
    writeJson({
      ok: true,
      module: 'arkfire.bridge-lamination',
      standalone: true,
      listening: `http://${host}:${port}`,
      health: '/health',
      latest: '/lamination/latest',
      laminations: '/laminations',
    });
  });

  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

const { command, options } = parseArgs(process.argv.slice(2));

try {
  if (command === 'health') await runHealth(options);
  else if (command === 'demo') await runDemo(options);
  else if (command === 'latest') await runLatest(options);
  else if (command === 'replay') await runReplay(options);
  else if (command === 'serve') await runServer(options);
  else {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exitCode = 2;
  }
} catch (error) {
  writeJson({
    ok: false,
    error: error?.code ?? error?.name ?? 'bridge-lamination-error',
    message: error?.message ?? String(error),
  });
  process.exitCode = 1;
}
