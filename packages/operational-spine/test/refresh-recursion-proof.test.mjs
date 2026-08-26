import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleOwnerRefreshController, proveRefreshRecursionBoundedNonMutation } from '../src/refresh-recursion-proof.mjs';

test('single-owner refresh controller rejects recursive refresh while owner is active', async () => {
  let nested;
  const controller = createSingleOwnerRefreshController({
    async onRefresh(reenter) {
      nested = await reenter();
    },
  });

  const outer = await controller.requestRefresh();
  assert.equal(outer.accepted, true);
  assert.deepEqual(nested, { accepted: false, reason: 'refresh-owner-active' });
  assert.deepEqual(controller.state(), { ownerActive: false, completed: 1, rejected: 1 });
});

test('refresh recursion proving receipt is bounded and non-mutating', async () => {
  const receipt = await proveRefreshRecursionBoundedNonMutation();
  assert.equal(receipt.schema, 'hearthfire.proving-receipt/v1');
  assert.equal(receipt.scenarioId, 'refresh.recursion');
  assert.equal(receipt.subsystem, 'arcsweep.refresh');
  assert.equal(receipt.passed, true);
  assert.equal(receipt.mutationDetected, false);
  assert.equal(receipt.actual.completedRefreshes, 1);
  assert.equal(receipt.actual.rejectedRecursiveRefreshes, 1);
  assert.equal(receipt.beforeDigest, receipt.afterDigest);
});
