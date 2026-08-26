import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommonsStateOwner,
  proveCommonsPersistenceFailureNonMutation,
} from '../src/commons-persistence-proof.mjs';

test('Commons owner advances state only after persistence succeeds', async () => {
  const persisted = [];
  const owner = new CommonsStateOwner({
    initialState: { entries: [{ id: 'a' }] },
    initialRevision: 2,
    persist: async (candidate) => persisted.push(candidate),
  });

  const committed = await owner.commit({ entries: [{ id: 'b' }] });
  assert.equal(committed.revision, 3);
  assert.deepEqual(committed.state, { entries: [{ id: 'b' }] });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].revision, 3);
});

test('failed persistence preserves prior committed Commons snapshot', async () => {
  const owner = new CommonsStateOwner({
    initialState: { entries: [{ id: 'baseline' }] },
    initialRevision: 4,
    persist: async () => {
      const error = new Error('database-offline');
      error.code = 'DB_OFFLINE';
      throw error;
    },
  });

  const before = owner.snapshot();
  await assert.rejects(owner.commit({ entries: [{ id: 'candidate' }] }), { code: 'DB_OFFLINE' });
  const after = owner.snapshot();
  assert.deepEqual(after, before);
});

test('Commons persistence failure proving receipt passes with non-mutation evidence', async () => {
  const receipt = await proveCommonsPersistenceFailureNonMutation();
  assert.equal(receipt.schema, 'hearthfire.proving-receipt/v1');
  assert.equal(receipt.scenarioId, 'commons.persistence-failure');
  assert.equal(receipt.subsystem, 'commons');
  assert.equal(receipt.passed, true);
  assert.equal(receipt.mutationDetected, false);
  assert.equal(receipt.beforeDigest, receipt.afterDigest);
  assert.match(receipt.actual, /committed revision remained 7/);
  assert.deepEqual(receipt.issues, []);
});
