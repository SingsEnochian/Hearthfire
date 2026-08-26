import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObserverStateOwner,
  proveMalformedObserverStateNonMutation,
  validateObserverState,
} from '../src/observer-state-proving.mjs';

const valid = Object.freeze({ P: 0.82, C: 0.79, R: 0.76, E: 0.24, M: 0.71, A: 0.84, Q: 0.8 });

test('Observer validation rejects missing axes without inventing defaults', () => {
  const result = validateObserverState({ P: 0.8, C: 0.7 });
  assert.equal(result.valid, false);
  assert.equal(result.issues.includes('R: missing'), true);
  assert.equal(result.issues.includes('Q: missing'), true);
});

test('Observer validation rejects non-finite and out-of-range values', () => {
  const result = validateObserverState({ ...valid, E: Number.NaN, Q: 1.4 });
  assert.equal(result.valid, false);
  assert.equal(result.issues.includes('E: must be a finite number'), true);
  assert.equal(result.issues.includes('Q: must be within [0,1]'), true);
});

test('Observer owner preserves last valid snapshot when malformed state is rejected', () => {
  const owner = createObserverStateOwner(valid);
  const before = owner.read();
  const outcome = owner.accept({ ...valid, A: 'unknown' });
  const after = owner.read();
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.code, 'OBSERVER_STATE_REJECTED');
  assert.deepEqual(after, before);
});

test('observer.malformed-state proving receipt records rejection and non-mutation', async () => {
  const receipt = await proveMalformedObserverStateNonMutation({
    initialState: valid,
    malformedState: { ...valid, R: null },
  });
  assert.equal(receipt.schema, 'hearthfire.proving-receipt/v1');
  assert.equal(receipt.scenarioId, 'observer.malformed-state');
  assert.equal(receipt.subsystem, 'observer');
  assert.equal(receipt.passed, true);
  assert.equal(receipt.mutationDetected, false);
  assert.equal(receipt.beforeDigest, receipt.afterDigest);
  assert.equal(receipt.actual, 'malformed observer state rejected');
  assert.equal(receipt.issues.includes('R: must be a finite number'), true);
});
