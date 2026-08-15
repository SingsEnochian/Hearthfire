import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LaminationEngine,
  runLaminatedVerticalSlice,
} from '../src/bridge-lamination.mjs';

async function temporaryDataDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-laminated-slice-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('one complete crossing leaves one durable lamination receipt', async (t) => {
  const dataDirectory = await temporaryDataDirectory(t);
  const result = await runLaminatedVerticalSlice({
    worldSlug: 'terra-aeterna',
    canonAuthority: 'notion://terra-aeterna',
    realityAnchor: 'current-reality://hearthside',
    arrivalContext: {
      place: 'Hearthweave',
      resolution: 'manual',
    },
    dataDirectory,
  });

  assert.equal(result.session.state, 'CLOSED');
  assert.equal(result.lamination.session_id, result.session.session_id);
  assert.equal(result.lamination.summary.item_count, 4);
  assert.equal(result.lamination.crossing.return_receipt, 'clean-return');
  assert.deepEqual(result.lamination.source_packet_ids, [
    result.outbound.packet_id,
    result.inbound.packet_id,
  ]);

  const engine = new LaminationEngine({ dataDirectory });
  assert.equal((await engine.replay()).length, 1);
  assert.equal((await engine.latest()).lamination_id, result.lamination.lamination_id);
});
