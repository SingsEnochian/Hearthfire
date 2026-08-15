import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BridgePolicyError,
  BridgeSession,
  runVerticalSlice,
} from '../src/bridge-session.mjs';

async function temporaryDataDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-session-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function baseOptions(dataDirectory) {
  return {
    worldSlug: 'terra-aeterna',
    canonAuthority: 'notion://terra-aeterna',
    realityAnchor: 'current-reality://hearthside',
    arrivalContext: {
      place: 'Hearthweave',
      resolution: 'manual',
    },
    dataDirectory,
  };
}

test('runs one complete Hearthside to Targetside vertical slice and returns cleanly', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const result = await runVerticalSlice(baseOptions(dataDirectory));

  assert.equal(result.session.state, 'CLOSED');
  assert.equal(result.session.world_slug, 'terra-aeterna');
  assert.equal(result.session.return_anchor.active, false);
  assert.equal(result.outbound.direction, 'hearthside-to-targetside');
  assert.equal(result.inbound.direction, 'targetside-to-hearthside');
  assert.equal(result.inbound.epistemic_register, 'target-world-narrative');
  assert.equal(result.inbound.provenance.response_to, result.outbound.packet_id);
  assert.deepEqual(
    result.ledger.filter((record) => record.event === 'packet.crossed').map((record) => record.data.packet.packet_id),
    [result.outbound.packet_id, result.inbound.packet_id],
  );
});

test('Feather pauses crossing and blocks packets until consent is restored', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const bridge = new BridgeSession(baseOptions(dataDirectory));

  await bridge.open();
  await bridge.load();
  await bridge.orient();
  await bridge.arrive();
  await bridge.beginExchange();
  await bridge.pause('Feather');

  assert.equal(bridge.snapshot().state, 'PAUSED');
  assert.equal(bridge.snapshot().consent_state, 'paused');

  await assert.rejects(
    bridge.send({
      direction: 'hearthside-to-targetside',
      channel: 'message',
      epistemicRegister: 'system-state',
      payload: { text: 'This must not cross.' },
    }),
    { code: 'bridge-not-exchanging' },
  );

  await bridge.resume();
  const packet = await bridge.send({
    direction: 'hearthside-to-targetside',
    channel: 'message',
    epistemicRegister: 'system-state',
    payload: { text: 'Consent restored.' },
  });

  assert.equal(packet.consent_state, 'open');
});

test('Plain pass changes presentation without removing bridge controls', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const bridge = new BridgeSession(baseOptions(dataDirectory));

  await bridge.open();
  const snapshot = await bridge.plainPass();

  assert.equal(snapshot.presentation_mode, 'plain');
  assert.equal(snapshot.return_anchor.cue, 'Notch');
  assert.equal(snapshot.return_anchor.active, true);
  assert.equal(snapshot.consent_state, 'open');
});

test('Targetside cannot originate an external-evidence claim', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const bridge = new BridgeSession(baseOptions(dataDirectory));

  await bridge.open();
  await bridge.load();
  await bridge.orient();
  await bridge.arrive();
  await bridge.beginExchange();

  await assert.rejects(
    bridge.send({
      direction: 'targetside-to-hearthside',
      channel: 'observation',
      epistemicRegister: 'external-observation',
      payload: { claim: 'Target-world state proves an external event.' },
    }),
    (error) => {
      assert.ok(error instanceof BridgePolicyError);
      assert.equal(error.code, 'targetside-external-evidence-claim');
      return true;
    },
  );
});

test('Notch is the explicit return cue', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const bridge = new BridgeSession(baseOptions(dataDirectory));

  await bridge.open();
  await assert.rejects(bridge.returnHome('wrong-cue'), { code: 'invalid-return-cue' });
  await bridge.returnHome('Notch');
  await bridge.close();

  assert.equal(bridge.snapshot().state, 'CLOSED');
});
