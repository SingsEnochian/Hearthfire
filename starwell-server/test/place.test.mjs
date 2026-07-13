import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
}

test('place manifest keeps Hearthfire as centre of gravity', async () => {
  const manifest = await readJson('place.manifest.json');
  assert.equal(manifest.id, 'starwell');
  assert.equal(manifest.hostPlace, 'hearthfire');
  assert.equal(manifest.centre, 'hearth');
  assert.equal(manifest.framework, 'rei-mythience');
  assert.equal(manifest.state.reiMythienceRoute, '/api/rei');
  assert.ok(manifest.rooms.some((room) => room.id === 'hearth'));
  assert.ok(manifest.rooms.some((room) => room.id === 'observatory'));
  assert.equal(manifest.state.actions, 'user-invoked');
});

test('REI Mythience manifest preserves method, instruments, and boundaries', async () => {
  const manifest = await readJson('rei-mythience.manifest.json');
  assert.equal(manifest.rei.expandedName, 'Reality Engine Interface');
  assert.equal(manifest.method.name, 'Mythience');
  assert.equal(manifest.hostPlace, 'hearthfire');
  assert.equal(manifest.interfaces.observatory, 'starwell');
  assert.equal(manifest.interfaces.instrument, 'deep');
  assert.equal(manifest.interfaces.implementationSpine, 'concordance-engine');
  assert.ok(manifest.method.requirements.includes('provenance-before-interpretation'));
  assert.ok(manifest.boundaries.includes('technical-access-is-not-ownership'));
  assert.ok(manifest.boundaries.includes('theoretical-and-instrumental-not-ontological-proof'));
});

test('public threshold contains spatial rooms and no dashboard language', async () => {
  const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
  for (const room of ['Observatory', 'Grand Library', 'Dreaming Grove', 'Workshop', 'Atlas Hall']) {
    assert.match(html, new RegExp(room));
  }
  assert.doesNotMatch(html, /dashboard/i);
  assert.doesNotMatch(html, /widget/i);
});

test('client syntax preserves a Hearth return path', async () => {
  const client = await readFile(resolve(root, 'public/starwell.js'), 'utf8');
  assert.match(client, /function goHearth/);
  assert.match(client, /LAST_ROOM_KEY/);
  assert.match(client, /user-invoked|storage is unavailable/i);
});

test('server exposes honest state and REI Mythience routes', async () => {
  const server = await readFile(resolve(root, 'server.mjs'), 'utf8');
  assert.match(server, /\/api\/state/);
  assert.match(server, /\/api\/rei/);
  assert.match(server, /framework: 'REI Mythience'/);
  assert.match(server, /rei-mythience-manifest-unavailable/);
});
