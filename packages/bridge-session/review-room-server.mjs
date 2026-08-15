#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContinuityExporter } from './src/continuity-exporter.mjs';
import { LaminationReviewStore } from './src/lamination-review.mjs';
import { applyLoopbackCors } from './src/loopback-cors.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(here, 'review-room');
const MAX_BODY_BYTES = 128 * 1024;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function parseArgs(argv) {
  const [command = 'serve', ...rest] = argv;
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

function json(response, status, body, method = 'GET') {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (method === 'HEAD') response.end();
  else response.end(JSON.stringify(body));
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
  const filePath = safePath(request.url ?? '/');
  if (!filePath) {
    json(response, 403, { ok: false, error: 'threshold-denied' }, request.method);
    return;
  }
  try {
    const fileStat = await stat(filePath);
    const resolvedPath = fileStat.isDirectory() ? resolve(filePath, 'index.html') : filePath;
    const body = await readFile(resolvedPath);
    response.writeHead(200, {
      'content-type': contentTypes[extname(resolvedPath)] ?? 'application/octet-stream',
      'cache-control': extname(resolvedPath) === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    json(response, 404, { ok: false, error: 'review-room-file-not-found' }, request.method);
  }
}

function errorStatus(error) {
  if (error?.code === 'request-body-too-large') return 413;
  if (error instanceof SyntaxError) return 400;
  if (['lamination-not-found', 'reviewed-lamination-not-found'].includes(error?.code)) return 404;
  if (['stale-lamination-review', 'stale-continuity-export'].includes(error?.code)) return 409;
  if (
    String(error?.code ?? '').includes('review')
    || String(error?.code ?? '').includes('lamination')
    || String(error?.code ?? '').includes('continuity')
  ) return 422;
  return 500;
}

async function combinedHealth(store, exporter) {
  const review = await store.health();
  const continuity = await exporter.health();
  return {
    ...review,
    continuity_packet_count: continuity.continuity_packet_count,
    latest_continuity_packet_id: continuity.latest_continuity_packet_id,
    continuity_packet_latest_path: continuity.packet_latest_path,
    loopback_cors: true,
  };
}

async function runHealth(options) {
  const dataDirectory = resolve(String(options.data ?? './data'));
  const store = new LaminationReviewStore({ dataDirectory });
  const exporter = new ContinuityExporter({ dataDirectory });
  process.stdout.write(`${JSON.stringify(await combinedHealth(store, exporter), null, 2)}\n`);
}

async function runServer(options) {
  const port = Number(options.port ?? process.env.PORT ?? 4319);
  const host = String(options.host ?? process.env.HOST ?? '127.0.0.1');
  const dataDirectory = resolve(String(options.data ?? './data'));
  const store = new LaminationReviewStore({ dataDirectory });
  const exporter = new ContinuityExporter({ dataDirectory });

  const server = createServer(async (request, response) => {
    const corsApplied = applyLoopbackCors(request, response);
    if (request.method === 'OPTIONS') {
      if (!corsApplied) {
        json(response, 403, { ok: false, error: 'loopback-origin-required' }, request.method);
      } else {
        response.writeHead(204, { 'cache-control': 'no-store' });
        response.end();
      }
      return;
    }

    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    const path = url.pathname;

    if (path === '/health') {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }
      json(response, 200, await combinedHealth(store, exporter), request.method);
      return;
    }

    if (path === '/api/lamination/latest') {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }
      const lamination = await store.latestLamination();
      if (!lamination) {
        json(response, 404, { ok: false, error: 'lamination-not-found' }, request.method);
        return;
      }
      json(response, 200, lamination, request.method);
      return;
    }

    if (path === '/api/review/latest') {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }
      json(response, 200, await store.latestReview(), request.method);
      return;
    }

    if (path === '/api/reviewed/latest') {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }
      json(response, 200, await store.latestReviewedLamination(), request.method);
      return;
    }

    if (path === '/api/reviews') {
      if (request.method !== 'POST') {
        json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }
      try {
        const body = await readRequestJson(request);
        const result = await store.review(body);
        json(response, 201, { ok: true, ...result }, request.method);
      } catch (error) {
        json(response, errorStatus(error), {
          ok: false,
          error: error?.code ?? error?.name ?? 'lamination-review-error',
          message: error?.message ?? String(error),
        }, request.method);
      }
      return;
    }

    if (path === '/api/continuity/latest') {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }
      json(response, 200, await exporter.latest(), request.method);
      return;
    }

    if (path === '/api/continuity') {
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }
      json(response, 200, await exporter.replay(), request.method);
      return;
    }

    if (path === '/api/continuity/export') {
      if (request.method !== 'POST') {
        json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
        return;
      }
      try {
        const body = await readRequestJson(request);
        const result = await exporter.exportAccepted(body);
        json(response, result.created ? 201 : 200, { ok: true, ...result }, request.method);
      } catch (error) {
        json(response, errorStatus(error), {
          ok: false,
          error: error?.code ?? error?.name ?? 'continuity-export-error',
          message: error?.message ?? String(error),
        }, request.method);
      }
      return;
    }

    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      json(response, 405, { ok: false, error: 'method-not-allowed' }, request.method);
      return;
    }
    await serveStatic(request, response);
  });

  server.listen(port, host, () => {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      module: 'arkfire.lamination-review-room',
      standalone: true,
      listening: `http://${host}:${port}`,
      data_directory: dataDirectory,
      health: '/health',
      latest_lamination: '/api/lamination/latest',
      latest_review: '/api/review/latest',
      reviewed_latest: '/api/reviewed/latest',
      continuity_latest: '/api/continuity/latest',
      continuity_replay: '/api/continuity',
      continuity_export: '/api/continuity/export',
      loopback_cors: 'localhost, 127.0.0.1, ::1 only',
    }, null, 2)}\n`);
  });

  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

const { command, options } = parseArgs(process.argv.slice(2));

try {
  if (command === 'health') await runHealth(options);
  else if (command === 'serve') await runServer(options);
  else {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exitCode = 2;
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: error?.code ?? error?.name ?? 'review-room-error',
    message: error?.message ?? String(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
}
