import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProjectZeroRoute } from '../project-zero-router.mjs';

function makeResponse() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

function json(response, status, body, requestMethod = 'GET') {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(requestMethod === 'HEAD' ? '' : JSON.stringify(body));
}

test('capabilities route is read-only and returns capability contract', async () => {
  const response = makeResponse();
  const handled = await handleProjectZeroRoute({
    path: '/api/project-zero/capabilities',
    request: { method: 'GET' },
    response,
    json,
  });
  assert.equal(handled, true);
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.schema, 'hearthfire.project-zero-capabilities/v1');
  assert.equal(body.capabilities.every((item) => item.mutates === false), true);
});

test('compatibility routes reject mutation methods', async () => {
  const response = makeResponse();
  const handled = await handleProjectZeroRoute({
    path: '/api/project-zero/capabilities',
    request: { method: 'POST' },
    response,
    json,
  });
  assert.equal(handled, true);
  assert.equal(response.status, 405);
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: 'method-not-allowed' });
});

test('unknown paths fall through to STARWELL upstream', async () => {
  const response = makeResponse();
  const handled = await handleProjectZeroRoute({
    path: '/health',
    request: { method: 'GET' },
    response,
    json,
  });
  assert.equal(handled, false);
  assert.equal(response.status, null);
});
