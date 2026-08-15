import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ContinuityExportPolicyError,
  ContinuityExportStateError,
  ContinuityExporter,
} from '../src/continuity-exporter.mjs';

async function temporaryDataDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'continuity-exporter-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function reviewedFixture(overrides = {}) {
  return {
    schema: 'hearthweave.bridge-lamination-reviewed/v0.1',
    source_schema: 'hearthweave.bridge-lamination/v0.1',
    lamination_id: 'lamination-1',
    session_id: 'session-1',
    world_slug: 'terra-aeterna',
    reviewed_at: '2026-07-31T04:48:00.000Z',
    review: {
      review_id: 'review-1',
      reviewer: 'Rowan',
      notes: null,
    },
    anchors: {
      canon_authority: 'notion://terra-aeterna',
      reality_anchor: 'current-reality://hearthside',
    },
    layers: {
      changed: [{
        item_id: 'item-system',
        layer: 'changed',
        text: 'The crossing completed cleanly.',
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: ['packet-1'],
      }],
      remained_true: [{
        item_id: 'item-held',
        layer: 'remained_true',
        text: 'A held possibility.',
        epistemic_register: 'interpretation',
        status: 'held',
        source_packet_ids: [],
      }],
      became_clearer: [{
        item_id: 'item-relationship',
        layer: 'became_clearer',
        text: 'The relationship boundary became clearer.',
        epistemic_register: 'relationship-state',
        status: 'accepted',
        source_packet_ids: [],
      }],
      gained: [{
        item_id: 'item-rejected',
        layer: 'gained',
        text: 'A rejected interpretation.',
        epistemic_register: 'creative-insight',
        status: 'rejected',
        source_packet_ids: [],
      }],
    },
    ...overrides,
  };
}

async function writeReviewed(directory, value = reviewedFixture()) {
  await writeFile(
    join(directory, 'bridge-lamination.reviewed.latest.json'),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

test('exports only accepted items while preserving review and packet provenance', async (t) => {
  const directory = await temporaryDataDirectory(t);
  await writeReviewed(directory);
  const exporter = new ContinuityExporter({
    dataDirectory: directory,
    clock: () => new Date('2026-07-31T05:00:00.000Z'),
  });

  const result = await exporter.exportAccepted({
    review_id: 'review-1',
    exported_by: 'Rowan',
  });

  assert.equal(result.created, true);
  assert.equal(result.packet.authority.scope, 'continuity-only');
  assert.equal(result.packet.authority.canon_commit, false);
  assert.equal(result.packet.accepted_items.length, 2);
  assert.deepEqual(
    result.packet.accepted_items.map((item) => item.source_item_id),
    ['item-system', 'item-relationship'],
  );
  assert.equal(result.packet.accepted_items[0].route, 'system-continuity');
  assert.equal(result.packet.accepted_items[0].source_packet_ids[0], 'packet-1');
  assert.equal(result.packet.accepted_items[1].route, 'relationship-continuity');
  assert.equal(result.packet.summary.held_count, 1);
  assert.equal(result.packet.summary.rejected_count, 1);

  const persisted = JSON.parse(await readFile(
    join(directory, 'bridge-continuity.latest.json'),
    'utf8',
  ));
  assert.equal(persisted.continuity_packet_id, result.packet.continuity_packet_id);
  assert.equal((await exporter.replay()).length, 1);
});

test('repeated export of the same reviewed layer is idempotent', async (t) => {
  const directory = await temporaryDataDirectory(t);
  await writeReviewed(directory);
  const exporter = new ContinuityExporter({ dataDirectory: directory });

  const first = await exporter.exportAccepted({ review_id: 'review-1', exported_by: 'Rowan' });
  const second = await exporter.exportAccepted({ review_id: 'review-1', exported_by: 'Rowan' });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.packet.continuity_packet_id, first.packet.continuity_packet_id);
  assert.equal((await exporter.replay()).length, 1);
});

test('rejects a stale review id', async (t) => {
  const directory = await temporaryDataDirectory(t);
  await writeReviewed(directory);
  const exporter = new ContinuityExporter({ dataDirectory: directory });

  await assert.rejects(
    exporter.exportAccepted({ review_id: 'older-review', exported_by: 'Rowan' }),
    (error) => {
      assert.ok(error instanceof ContinuityExportStateError);
      assert.equal(error.code, 'stale-continuity-export');
      return true;
    },
  );
});

test('requires at least one accepted item', async (t) => {
  const directory = await temporaryDataDirectory(t);
  const reviewed = reviewedFixture();
  for (const items of Object.values(reviewed.layers)) {
    for (const item of items) item.status = 'held';
  }
  await writeReviewed(directory, reviewed);
  const exporter = new ContinuityExporter({ dataDirectory: directory });

  await assert.rejects(
    exporter.exportAccepted({ review_id: 'review-1', exported_by: 'Rowan' }),
    (error) => {
      assert.ok(error instanceof ContinuityExportPolicyError);
      assert.equal(error.code, 'no-accepted-continuity-items');
      return true;
    },
  );
});

test('health reports reviewed source and packet persistence honestly', async (t) => {
  const directory = await temporaryDataDirectory(t);
  await writeReviewed(directory);
  const exporter = new ContinuityExporter({ dataDirectory: directory });

  const before = await exporter.health();
  assert.equal(before.reviewed_lamination_available, true);
  assert.equal(before.continuity_packet_count, 0);

  await exporter.exportAccepted({ review_id: 'review-1', exported_by: 'Rowan' });
  const after = await exporter.health();
  assert.equal(after.continuity_packet_count, 1);
  assert.ok(after.latest_continuity_packet_id);
});
