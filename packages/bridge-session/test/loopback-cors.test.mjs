import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLoopbackCors, isAllowedLoopbackOrigin } from '../src/loopback-cors.mjs';

test('allows only HTTP(S) loopback origins', () => {
  assert.equal(isAllowedLoopbackOrigin('http://127.0.0.1:5173'), true);
  assert.equal(isAllowedLoopbackOrigin('http://localhost:4173'), true);
  assert.equal(isAllowedLoopbackOrigin('https://[::1]:8443'), true);
  assert.equal(isAllowedLoopbackOrigin('https://example.com'), false);
  assert.equal(isAllowedLoopbackOrigin('file:///tmp/index.html'), false);
  assert.equal(isAllowedLoopbackOrigin('not a url'), false);
});

test('applies narrow CORS response headers for an allowed loopback origin', () => {
  const headers = new Map();
  const response = { setHeader: (name, value) => headers.set(name, value) };
  const request = { headers: { origin: 'http://127.0.0.1:5173' } };

  assert.equal(applyLoopbackCors(request, response), true);
  assert.equal(headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  assert.equal(headers.get('access-control-allow-methods'), 'GET, HEAD, POST, OPTIONS');
  assert.equal(headers.get('access-control-allow-headers'), 'Accept, Content-Type');
  assert.equal(headers.get('vary'), 'Origin');
});

test('does not emit CORS headers for non-loopback origins', () => {
  const headers = new Map();
  const response = { setHeader: (name, value) => headers.set(name, value) };
  const request = { headers: { origin: 'https://example.com' } };

  assert.equal(applyLoopbackCors(request, response), false);
  assert.equal(headers.size, 0);
});
