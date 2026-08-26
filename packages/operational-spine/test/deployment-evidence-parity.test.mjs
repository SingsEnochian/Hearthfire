import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDeploymentEvidenceParity, createDeploymentEvidenceParityReceipt } from '../src/deployment-evidence-parity.mjs';

test('deployment evidence parity passes when all commit identities match', () => {
  const commit = 'abc123';
  const parity = compareDeploymentEvidenceParity({ releaseCommit: commit, deployedCommit: commit, diagnosticsCommit: commit, provingArtifactCommit: commit });
  assert.equal(parity.complete, true);
  assert.equal(parity.matches, true);
  assert.deepEqual(parity.mismatches, []);
  const receipt = createDeploymentEvidenceParityReceipt({ releaseCommit: commit, deployedCommit: commit, diagnosticsCommit: commit, provingArtifactCommit: commit });
  assert.equal(receipt.passed, true);
  assert.equal(receipt.mutationDetected, false);
});

test('deployment evidence parity fails closed on divergence', () => {
  const parity = compareDeploymentEvidenceParity({ releaseCommit: 'release', deployedCommit: 'release', diagnosticsCommit: 'other', provingArtifactCommit: 'release' });
  assert.equal(parity.complete, true);
  assert.equal(parity.matches, false);
  assert.deepEqual(parity.mismatches.map((item) => item.key), ['diagnosticsCommit']);
  const receipt = createDeploymentEvidenceParityReceipt({ releaseCommit: 'release', deployedCommit: 'release', diagnosticsCommit: 'other', provingArtifactCommit: 'release' });
  assert.equal(receipt.passed, false);
  assert.match(receipt.issues.join('\n'), /diagnosticsCommit mismatch/);
});

test('deployment evidence parity fails closed when an identity is missing', () => {
  const parity = compareDeploymentEvidenceParity({ releaseCommit: 'release', deployedCommit: 'release', diagnosticsCommit: null, provingArtifactCommit: 'release' });
  assert.equal(parity.complete, false);
  assert.equal(parity.matches, false);
  assert.deepEqual(parity.mismatches.map((item) => item.key), ['diagnosticsCommit']);
});
