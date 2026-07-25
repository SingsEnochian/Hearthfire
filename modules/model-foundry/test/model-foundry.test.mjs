import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RegistryStore } from '../src/store.mjs';
import { startFoundryServer } from '../src/server.mjs';

async function temporaryDirectory(name) {
  return mkdtemp(join(tmpdir(), `${name}-`));
}

async function startMockOllama() {
  const server = createServer((request, response) => {
    if (request.url === '/api/tags') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        models: [
          {
            name: 'test-model:latest',
            size: 123456,
            digest: 'sha256:test',
            modified_at: '2026-07-25T00:00:00.000Z',
            details: { family: 'test' },
          },
        ],
      }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, rejectPromise) => {
      server.close((error) => error ? rejectPromise(error) : resolvePromise());
    }),
  };
}

test('registry persists provider profiles across a new store instance', async () => {
  const directory = await temporaryDirectory('model-foundry-store');
  try {
    const first = new RegistryStore(directory);
    await first.init();
    await first.upsertProvider({
      providerId: 'ollama.test-persistent',
      displayName: 'Persistent Test',
      endpoint: 'http://127.0.0.1:11999',
      kind: 'ollama',
      enabled: true,
    });

    const second = new RegistryStore(directory);
    const registry = await second.readRegistry();
    assert.equal(registry.providers.some((provider) => provider.providerId === 'ollama.test-persistent'), true);
    assert.ok(registry.revision >= 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('standalone service discovers a configured Ollama model and records health', async () => {
  const directory = await temporaryDirectory('model-foundry-service');
  const ollama = await startMockOllama();
  const foundry = await startFoundryServer({ port: 0, dataDirectory: directory, logger: { error() {} } });
  try {
    let response = await fetch(`${foundry.url}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'ollama.mock',
        displayName: 'Mock Ollama',
        endpoint: ollama.endpoint,
        kind: 'ollama',
        enabled: true,
      }),
    });
    assert.equal(response.status, 200);

    response = await fetch(`${foundry.url}/api/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerIds: ['ollama.mock'] }),
    });
    assert.equal(response.status, 200);
    const probe = await response.json();
    assert.equal(probe.results[0].status, 'available');
    assert.equal(probe.results[0].models[0].name, 'test-model:latest');

    response = await fetch(`${foundry.url}/api/registry`);
    const registryBody = await response.json();
    const provider = registryBody.registry.providers.find((entry) => entry.providerId === 'ollama.mock');
    assert.equal(provider.lastHealth.status, 'available');
    assert.equal(provider.models[0].name, 'test-model:latest');

    response = await fetch(`${foundry.url}/health`);
    const health = await response.json();
    assert.equal(health.ok, true);
    assert.equal(health.moduleId, 'arkfire.models');
  } finally {
    await foundry.close();
    await ollama.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('unavailable endpoints remain honest and do not crash the module', async () => {
  const directory = await temporaryDirectory('model-foundry-unavailable');
  const foundry = await startFoundryServer({ port: 0, dataDirectory: directory, logger: { error() {} } });
  try {
    await fetch(`${foundry.url}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'ollama.absent',
        displayName: 'Absent Ollama',
        endpoint: 'http://127.0.0.1:9',
        kind: 'ollama',
        enabled: true,
      }),
    });
    const response = await fetch(`${foundry.url}/api/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerIds: ['ollama.absent'], timeoutMs: 1000 }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.results[0].status, 'unavailable');
    assert.equal(body.results[0].models.length, 0);
    assert.ok(body.results[0].error);
  } finally {
    await foundry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('export bundle restores into an empty standalone instance', async () => {
  const sourceDirectory = await temporaryDirectory('model-foundry-export');
  const targetDirectory = await temporaryDirectory('model-foundry-import');
  const source = await startFoundryServer({ port: 0, dataDirectory: sourceDirectory, logger: { error() {} } });
  const target = await startFoundryServer({ port: 0, dataDirectory: targetDirectory, logger: { error() {} } });
  try {
    await fetch(`${source.url}/api/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: 'ollama.exported',
        displayName: 'Exported Ollama',
        endpoint: 'http://127.0.0.1:12000',
        kind: 'ollama',
        enabled: false,
      }),
    });

    const exportResponse = await fetch(`${source.url}/api/export`);
    const bundle = await exportResponse.json();
    assert.equal(bundle.secretsIncluded, false);

    const importResponse = await fetch(`${target.url}/api/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bundle),
    });
    assert.equal(importResponse.status, 200);

    const registryResponse = await fetch(`${target.url}/api/registry`);
    const restored = await registryResponse.json();
    assert.equal(restored.registry.providers.some((provider) => provider.providerId === 'ollama.exported'), true);
  } finally {
    await source.close();
    await target.close();
    await rm(sourceDirectory, { recursive: true, force: true });
    await rm(targetDirectory, { recursive: true, force: true });
  }
});
