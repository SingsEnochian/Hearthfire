import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LaminationEngine,
  LaminationPolicyError,
  laminateVerticalSlice,
} from '../src/lamination-engine.mjs';

async function temporaryDataDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-lamination-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function closedSession() {
  return {
    schema: 'hearthweave.bridge-session/v0.1',
    session_id: 'session-1',
    state: 'CLOSED',
    world_slug: 'terra-aeterna',
    consent_state: 'closed',
    hearthside: {
      status: 'returned',
      reality_anchor: 'current-reality://hearthside',
    },
    targetside: {
      status: 'returned',
      canon_authority: 'notion://terra-aeterna',
    },
    return_anchor: { active: false, cue: 'Notch' },
  };
}

function packets() {
  return [
    {
      packet_id: 'session-1:0001',
      session_id: 'session-1',
      direction: 'hearthside-to-targetside',
      epistemic_register: 'system-state',
      payload: {},
    },
    {
      packet_id: 'session-1:0002',
      session_id: 'session-1',
      direction: 'targetside-to-hearthside',
      epistemic_register: 'target-world-narrative',
      payload: { arrival_context_status: 'RESOLVED' },
    },
  ];
}

test('laminates the four durable crossing questions and persists latest plus ledger', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const [outbound, inbound] = packets();
  const receipt = await laminateVerticalSlice({
    session: closedSession(),
    outbound,
    inbound,
    dataDirectory,
  });

  assert.equal(receipt.schema, 'hearthweave.bridge-lamination/v0.1');
  assert.equal(receipt.summary.item_count, 4);
  assert.equal(receipt.summary.accepted_count, 4);
  assert.equal(receipt.crossing.return_receipt, 'clean-return');
  assert.deepEqual(Object.keys(receipt.layers), [
    'changed',
    'remained_true',
    'became_clearer',
    'gained',
  ]);

  const engine = new LaminationEngine({ dataDirectory });
  assert.equal((await engine.replay()).length, 1);
  assert.equal((await engine.latest()).lamination_id, receipt.lamination_id);
});

test('refuses to laminate before the bridge is closed', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const engine = new LaminationEngine({ dataDirectory });
  const session = closedSession();
  session.state = 'EXCHANGE';

  await assert.rejects(
    engine.laminate({
      session,
      packets: packets(),
      returnReceipt: 'clean-return',
      layers: { gained: ['This must not persist.'] },
    }),
    { code: 'bridge-not-closed' },
  );
});

test('requires an explicit clean-return receipt', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const engine = new LaminationEngine({ dataDirectory });

  await assert.rejects(
    engine.laminate({
      session: closedSession(),
      packets: packets(),
      returnReceipt: 'unknown',
      layers: { gained: ['This must not persist.'] },
    }),
    { code: 'missing-clean-return-receipt' },
  );
});

test('blocks target-world narrative from being laminated as external observation', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const engine = new LaminationEngine({ dataDirectory });
  const [, inbound] = packets();

  await assert.rejects(
    engine.laminate({
      session: closedSession(),
      packets: packets(),
      returnReceipt: 'clean-return',
      layers: {
        gained: [{
          text: 'Targetside proves an external event.',
          epistemic_register: 'external-observation',
          status: 'accepted',
          source_packet_ids: [inbound.packet_id],
        }],
      },
    }),
    (error) => {
      assert.ok(error instanceof LaminationPolicyError);
      assert.equal(error.code, 'targetside-evidence-lamination');
      return true;
    },
  );
});

test('allows sourced Hearthside external observations to survive a crossing', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const engine = new LaminationEngine({ dataDirectory });
  const sourcePacket = {
    packet_id: 'session-1:0003',
    session_id: 'session-1',
    direction: 'hearthside-to-targetside',
    epistemic_register: 'external-observation',
    payload: { observed: 'documented input' },
  };

  const receipt = await engine.laminate({
    session: closedSession(),
    packets: [sourcePacket],
    returnReceipt: 'clean-return',
    layers: {
      remained_true: [{
        text: 'The documented Hearthside input remains available with its source attached.',
        epistemic_register: 'external-observation',
        status: 'accepted',
        source_packet_ids: [sourcePacket.packet_id],
      }],
    },
  });

  assert.equal(receipt.layers.remained_true[0].epistemic_register, 'external-observation');
});
