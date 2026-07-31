import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LaminationReviewPolicyError,
  LaminationReviewStateError,
  LaminationReviewStore,
  REVIEWED_LAMINATION_SCHEMA,
} from '../src/lamination-review.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'lamination-review-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(directory, { recursive: true });

  const lamination = {
    schema: 'hearthweave.bridge-lamination/v0.1',
    lamination_id: 'laminate-001',
    session_id: 'session-001',
    world_slug: 'terra-aeterna',
    created_at: '2026-07-31T04:14:14.000Z',
    crossing: { return_receipt: 'clean-return' },
    layers: {
      changed: [{
        item_id: 'changed-1',
        layer: 'changed',
        text: 'The bridge completed a bounded crossing.',
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: ['session-001:0001'],
      }],
      remained_true: [{
        item_id: 'true-1',
        layer: 'remained_true',
        text: 'The Hearthside anchor remained explicit.',
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: ['session-001:0001'],
      }],
      became_clearer: [{
        item_id: 'clear-1',
        layer: 'became_clearer',
        text: 'The arrival context resolved.',
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: ['session-001:0002'],
      }],
      gained: [{
        item_id: 'gained-1',
        layer: 'gained',
        text: 'A replayable receipt exists.',
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: ['session-001:0001', 'session-001:0002'],
      }],
    },
    summary: { item_count: 4, accepted_count: 4, candidate_count: 0, held_count: 0, rejected_count: 0 },
  };

  await writeFile(join(directory, 'bridge-lamination.latest.json'), JSON.stringify(lamination, null, 2), 'utf8');
  return { directory, lamination };
}

function decisions(lamination) {
  return Object.values(lamination.layers).flat().map((item) => ({
    item_id: item.item_id,
    text: item.text,
    status: item.item_id === 'clear-1' ? 'held' : item.status,
  }));
}

test('writes an immutable review receipt and reviewed-latest laminate', async (t) => {
  const { directory, lamination } = await fixture(t);
  const store = new LaminationReviewStore({
    dataDirectory: directory,
    clock: () => new Date('2026-07-31T04:30:00.000Z'),
  });

  const result = await store.review({
    lamination_id: lamination.lamination_id,
    reviewer: 'Rowan',
    decisions: decisions(lamination),
    additions: [{
      layer: 'gained',
      text: 'The review room now exists as a usable local surface.',
      status: 'accepted',
      epistemic_register: 'system-state',
    }],
    notes: 'First deliberate review.',
  });

  assert.equal(result.review.reviewer, 'Rowan');
  assert.equal(result.review.summary.item_count, 5);
  assert.equal(result.review.summary.held_count, 1);
  assert.equal(result.review.summary.accepted_count, 4);
  assert.equal(result.reviewed_lamination.schema, REVIEWED_LAMINATION_SCHEMA);
  assert.equal(result.reviewed_lamination.layers.gained.length, 2);

  const original = JSON.parse(await readFile(join(directory, 'bridge-lamination.latest.json'), 'utf8'));
  assert.equal(original.layers.became_clearer[0].status, 'accepted');

  const latestReview = await store.latestReview();
  const reviewedLatest = await store.latestReviewedLamination();
  assert.equal(latestReview.review_id, result.review.review_id);
  assert.equal(reviewedLatest.review.review_id, result.review.review_id);
  assert.equal((await store.replayReviews()).length, 1);
});

test('rejects a stale lamination id', async (t) => {
  const { directory, lamination } = await fixture(t);
  const store = new LaminationReviewStore({ dataDirectory: directory });

  await assert.rejects(
    store.review({
      lamination_id: 'older-laminate',
      decisions: decisions(lamination),
    }),
    (error) => {
      assert.ok(error instanceof LaminationReviewStateError);
      assert.equal(error.code, 'stale-lamination-review');
      return true;
    },
  );
});

test('requires one decision for every original item', async (t) => {
  const { directory, lamination } = await fixture(t);
  const store = new LaminationReviewStore({ dataDirectory: directory });

  await assert.rejects(
    store.review({
      lamination_id: lamination.lamination_id,
      decisions: decisions(lamination).slice(0, 3),
    }),
    (error) => {
      assert.ok(error instanceof LaminationReviewPolicyError);
      assert.equal(error.code, 'incomplete-lamination-review');
      return true;
    },
  );
});

test('new review-room items cannot invent external observations', async (t) => {
  const { directory, lamination } = await fixture(t);
  const store = new LaminationReviewStore({ dataDirectory: directory });

  await assert.rejects(
    store.review({
      lamination_id: lamination.lamination_id,
      decisions: decisions(lamination),
      additions: [{
        layer: 'gained',
        text: 'An unsourced external event occurred.',
        epistemic_register: 'external-observation',
        status: 'accepted',
      }],
    }),
    (error) => {
      assert.ok(error instanceof LaminationReviewPolicyError);
      assert.equal(error.code, 'review-addition-external-observation');
      return true;
    },
  );
});
