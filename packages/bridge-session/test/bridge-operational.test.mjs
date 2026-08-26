import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BridgeSession } from '../src/bridge-session.mjs';
import { proveInvalidTransitionNonMutation } from '../src/bridge-operational.mjs';

test('bridge owner reports ready state and operational provenance', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'hearthfire-bridge-operational-'));
  const session = new BridgeSession({
    worldSlug: 'terra-aeterna',
    canonAuthority: 'canon://terra-aeterna',
    realityAnchor: 'hearthside://rowan',
    dataDirectory,
  });

  const diagnostics = session.diagnostics();
  assert.equal(diagnostics.schema, 'hearthfire.project-zero-diagnostics/v1');
  assert.equal(diagnostics.owner.ready, true);
  assert.equal(diagnostics.owner.owner, 'bridge-session');
  assert.equal(diagnostics.provenance.source, '@hearthfire/bridge-session');
});

test('invalid bridge transition is rejected with non-mutation receipt', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'hearthfire-bridge-proving-'));
  const session = new BridgeSession({
    worldSlug: 'terra-aeterna',
    canonAuthority: 'canon://terra-aeterna',
    realityAnchor: 'hearthside://rowan',
    dataDirectory,
  });

  const receipt = await proveInvalidTransitionNonMutation(session);
  assert.equal(receipt.passed, true);
  assert.equal(receipt.mutationDetected, false);
  assert.equal(receipt.beforeDigest, receipt.afterDigest);

  const diagnostics = session.diagnostics();
  assert.ok(diagnostics.recentEvents.some((event) => event.event === 'BRIDGE_TRANSITION_REJECTED'));
  assert.ok(diagnostics.recentEvents.some((event) => event.event === 'PROVING_SCENARIO_PASS'));
});

test('health includes project zero operational diagnostics', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'hearthfire-bridge-health-'));
  const session = new BridgeSession({
    worldSlug: 'terra-aeterna',
    canonAuthority: 'canon://terra-aeterna',
    realityAnchor: 'hearthside://rowan',
    dataDirectory,
  });

  const health = await session.health();
  assert.equal(health.ok, true);
  assert.equal(health.operational.owner.ready, true);
  assert.equal(health.operational.subsystem, 'bridge.session');
});
