import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { concordanceSchema, evaluateConcordance } from '../public/concordance-engine.js';

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

test('REI Mythience manifest preserves method, instruments, portal, and boundaries', async () => {
  const manifest = await readJson('rei-mythience.manifest.json');
  assert.equal(manifest.rei.expandedName, 'Reality Engine Interface');
  assert.equal(manifest.method.name, 'Mythience');
  assert.equal(manifest.hostPlace, 'hearthfire');
  assert.equal(manifest.interfaces.observatory, 'starwell');
  assert.equal(manifest.interfaces.instrument, 'deep');
  assert.equal(manifest.interfaces.implementationSpine, 'concordance-engine');
  assert.equal(manifest.interfaces.portal, 'same-room-starwell-reskin');
  assert.equal(manifest.concordance.engineVersion, '0.2.0');
  assert.equal(manifest.portal.crossing, 'explicit-user-invoked');
  assert.equal(manifest.portal.return, 'reversible');
  assert.ok(manifest.portal.preserves.includes('room'));
  assert.ok(manifest.method.requirements.includes('provenance-before-interpretation'));
  assert.ok(manifest.boundaries.includes('technical-access-is-not-ownership'));
  assert.ok(manifest.boundaries.includes('theoretical-and-instrumental-not-ontological-proof'));
});

test('Concordance Engine evaluates a complete six-term vector with a traceable quotient', () => {
  const reading = evaluateConcordance({
    pulse: 0.68,
    coherence: 0.89,
    resonance: 0.92,
    entropy: 0.34,
    memory: 0.76,
    axis: 0.81,
  }, {
    mode: 'test-observation',
    sources: ['fixture'],
  });

  assert.equal(reading.engine, 'concordance-engine');
  assert.equal(reading.version, '0.2.0');
  assert.equal(reading.quotient, 0.809);
  assert.equal(reading.phase.id, 'concordant');
  assert.equal(reading.strongest.metric, 'resonance');
  assert.equal(reading.provenance.mode, 'test-observation');
  assert.match(reading.trace.formula, /0\.10\(1-E\)/);
  assert.match(reading.boundary, /heuristic instrument/i);
});

test('Concordance Engine rejects incomplete vectors rather than inventing missing observations', () => {
  assert.throws(
    () => evaluateConcordance({ pulse: 0.5 }),
    (error) => error.code === 'invalid-concordance-vector' && error.details.missing.includes('axis'),
  );
});

test('Concordance schema exposes weights and explicit entropy inversion', () => {
  const schema = concordanceSchema();
  assert.equal(schema.version, '0.2.0');
  assert.equal(schema.metrics.length, 6);
  assert.equal(schema.metrics.find((metric) => metric.key === 'entropy').invert, true);
  assert.match(schema.formula, /0\.22R/);
});

test('public threshold contains spatial rooms, portal doorway, and no dashboard language', async () => {
  const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
  for (const room of ['Observatory', 'Grand Library', 'Dreaming Grove', 'Workshop', 'Atlas Hall']) {
    assert.match(html, new RegExp(room));
  }
  assert.match(html, /id="starwell-portal"/);
  assert.match(html, /data-skin="hearthfire"/);
  assert.match(html, /portal-concordance\.css/);
  assert.match(html, /Open the Concordance Lens/);
  assert.doesNotMatch(html, /dashboard/i);
  assert.doesNotMatch(html, /widget/i);
});

test('client preserves a Hearth return path and reversible STARWELL reskin', async () => {
  const client = await readFile(resolve(root, 'public/starwell.js'), 'utf8');
  assert.match(client, /function goHearth/);
  assert.match(client, /function setSkin/);
  assert.match(client, /function togglePortal/);
  assert.match(client, /data\.skin|dataset\.skin/);
  assert.match(client, /SKIN_KEY/);
  assert.match(client, /CONCORDANCE_KEY/);
  assert.match(client, /evaluateConcordance/);
  assert.match(client, /user-invoked|storage is unavailable/i);
});

test('server exposes honest state, REI Mythience, and Concordance routes', async () => {
  const server = await readFile(resolve(root, 'server.mjs'), 'utf8');
  assert.match(server, /\/api\/state/);
  assert.match(server, /\/api\/rei/);
  assert.match(server, /\/api\/concordance\/schema/);
  assert.match(server, /\/api\/concordance\/evaluate/);
  assert.match(server, /evaluateConcordance/);
  assert.match(server, /request-body-too-large/);
  assert.match(server, /framework: 'REI Mythience'/);
  assert.match(server, /rei-mythience-manifest-unavailable/);
});
