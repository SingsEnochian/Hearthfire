import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeRouteOwner, proveRuntimeOfflineRoutingNonMutation } from '../src/runtime-offline-routing-proof.mjs';

test('routes directly when requested route is online', () => {
  const owner = new RuntimeRouteOwner({
    routes: { primary: { online: true }, fallback: { online: true } },
    fallbackRoute: 'fallback',
  });
  const result = owner.route('primary');
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'direct');
  assert.equal(result.selectedRoute, 'primary');
});

test('falls back explicitly when requested route is offline', () => {
  const owner = new RuntimeRouteOwner({
    routes: { primary: { online: false }, fallback: { online: true } },
    fallbackRoute: 'fallback',
  });
  const result = owner.route('primary');
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'fallback');
  assert.equal(result.selectedRoute, 'fallback');
  assert.equal(result.reason, 'requested-route-offline');
});

test('fails closed when requested route and fallback are offline', () => {
  const owner = new RuntimeRouteOwner({
    routes: { primary: { online: false }, fallback: { online: false } },
    fallbackRoute: 'fallback',
  });
  const before = owner.snapshot();
  const result = owner.route('primary');
  assert.equal(result.ok, false);
  assert.equal(result.mode, 'fail-closed');
  assert.equal(result.selectedRoute, null);
  assert.deepEqual(owner.snapshot(), before);
});

test('runtime offline proving receipt passes without protected-state mutation', async () => {
  const owner = new RuntimeRouteOwner({
    routes: { primary: { online: false }, fallback: { online: true } },
    fallbackRoute: 'fallback',
  });
  const receipt = await proveRuntimeOfflineRoutingNonMutation(owner, 'primary');
  assert.equal(receipt.schema, 'hearthfire.proving-receipt/v1');
  assert.equal(receipt.scenarioId, 'runtime.offline-routing');
  assert.equal(receipt.passed, true);
  assert.equal(receipt.mutationDetected, false);
  assert.equal(receipt.actual.mode, 'fallback');
  assert.equal(receipt.actual.selectedRoute, 'fallback');
});
