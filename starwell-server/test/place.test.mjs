import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('place manifest keeps Hearthfire as centre of gravity', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'place.manifest.json'), 'utf8'));
  assert.equal(manifest.id, 'starwell');
  assert.equal(manifest.hostPlace, 'hearthfire');
  assert.equal(manifest.centre, 'hearth');
  assert.ok(manifest.rooms.some((room) => room.id === 'hearth'));
  assert.ok(manifest.rooms.some((room) => room.id === 'observatory'));
  assert.equal(manifest.state.actions, 'user-invoked');
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
