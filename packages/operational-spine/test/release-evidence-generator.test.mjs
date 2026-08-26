import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_PROVING_SCENARIOS,
  generateReleaseEvidence,
  serializeReleaseEvidence,
  validateProvingReceiptSet,
} from '../src/release-evidence-generator.mjs';

function receipt(scenarioId, overrides = {}) {
  return {
    schema: 'hearthfire.proving-receipt/v1',
    scenarioId,
    subsystem: scenarioId,
    expected: 'expected behaviour',
    passed: true,
    mutationDetected: false,
    beforeDigest: 'before',
    afterDigest: 'before',
    actual: 'proved',
    issues: [],
    provenance: { source: 'test' },
    completedAt: '2026-08-26T20:00:00.000Z',
    ...overrides,
  };
}

function completeReceipts() {
  return REQUIRED_PROVING_SCENARIOS.map((scenarioId) => receipt(scenarioId));
}

test('complete proving set generates release evidence bound to release and commit', () => {
  const manifest = generateReleaseEvidence({
    releaseId: 'hearthfire-test-release',
    commit: 'abc123',
    provingReceipts: completeReceipts(),
    schemas: ['hearthfire.proving-receipt/v1'],
    generatedAt: '2026-08-26T20:05:00.000Z',
  });

  assert.equal(manifest.schema, 'hearthfire.release-evidence/v1');
  assert.equal(manifest.releaseId, 'hearthfire-test-release');
  assert.equal(manifest.commit, 'abc123');
  assert.equal(manifest.validationReceipts.length, REQUIRED_PROVING_SCENARIOS.length);
  assert.deepEqual(manifest.provenance.requiredScenarioIds, REQUIRED_PROVING_SCENARIOS);
});

test('missing, failed, mutated, and duplicate proving receipts are rejected', () => {
  const missing = completeReceipts().slice(1);
  assert.match(validateProvingReceiptSet(missing).join('\n'), /missing proving receipt: refresh\.recursion/);

  const failed = completeReceipts();
  failed[0] = receipt(failed[0].scenarioId, { passed: false });
  assert.match(validateProvingReceiptSet(failed).join('\n'), /did not pass: refresh\.recursion/);

  const mutated = completeReceipts();
  mutated[1] = receipt(mutated[1].scenarioId, { mutationDetected: true });
  assert.match(validateProvingReceiptSet(mutated).join('\n'), /protected-state mutation detected: observer\.malformed-state/);

  const duplicate = [...completeReceipts(), receipt('refresh.recursion')];
  assert.match(validateProvingReceiptSet(duplicate).join('\n'), /duplicate proving receipt: refresh\.recursion/);
});

test('generator fails closed on incomplete proving evidence', () => {
  assert.throws(() => generateReleaseEvidence({
    releaseId: 'incomplete',
    commit: 'deadbeef',
    provingReceipts: [receipt('refresh.recursion')],
  }), /Invalid proving receipt set/);
});

test('serialized evidence is stable JSON text with trailing newline', () => {
  const manifest = generateReleaseEvidence({
    releaseId: 'serialize-test',
    commit: 'abc123',
    provingReceipts: completeReceipts(),
    generatedAt: '2026-08-26T20:05:00.000Z',
  });
  const text = serializeReleaseEvidence(manifest);
  assert.equal(text.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(text), manifest);
});
