export function compareDeploymentEvidenceParity({ releaseCommit, deployedCommit, diagnosticsCommit, provingArtifactCommit } = {}) {
  const commits = {
    releaseCommit: releaseCommit ?? null,
    deployedCommit: deployedCommit ?? null,
    diagnosticsCommit: diagnosticsCommit ?? null,
    provingArtifactCommit: provingArtifactCommit ?? null,
  };
  const values = Object.values(commits);
  const complete = values.every((value) => typeof value === 'string' && value.length > 0);
  const reference = commits.releaseCommit;
  const mismatches = complete
    ? Object.entries(commits).filter(([, value]) => value !== reference).map(([key, value]) => ({ key, expected: reference, actual: value }))
    : Object.entries(commits).filter(([, value]) => !value).map(([key]) => ({ key, expected: 'non-empty commit', actual: null }));
  return Object.freeze({
    schema: 'hearthfire.deployment-evidence-parity/v1',
    complete,
    matches: complete && mismatches.length === 0,
    commits: Object.freeze(commits),
    mismatches: Object.freeze(mismatches),
  });
}

export function createDeploymentEvidenceParityReceipt(input) {
  const parity = compareDeploymentEvidenceParity(input);
  return Object.freeze({
    schema: 'hearthfire.proving-receipt/v1',
    scenarioId: 'deployment.evidence-parity',
    subsystem: 'deployment.evidence',
    expected: 'release, deployed, diagnostics, and proving-artifact commits are identical',
    passed: parity.matches,
    mutationDetected: false,
    beforeDigest: null,
    afterDigest: null,
    actual: parity,
    issues: parity.matches ? [] : parity.mismatches.map((item) => `${item.key} mismatch`),
    provenance: { source: '@hearthfire/operational-spine', contract: parity.schema },
    completedAt: new Date().toISOString(),
  });
}
