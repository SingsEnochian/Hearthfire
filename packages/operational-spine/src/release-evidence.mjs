export function createReleaseEvidenceManifest(input) {
  const manifest = {
    schema: 'hearthfire.release-evidence/v1',
    releaseId: input.releaseId,
    commit: input.commit,
    schemas: input.schemas ?? [],
    migrations: input.migrations ?? [],
    fixtures: input.fixtures ?? [],
    validationReceipts: input.validationReceipts ?? [],
    deployment: input.deployment ?? null,
    provenance: input.provenance ?? null,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
  const issues = validateReleaseEvidenceManifest(manifest);
  if (issues.length) throw new TypeError(`Invalid release evidence manifest: ${issues.join('; ')}`);
  return Object.freeze(manifest);
}

export function validateReleaseEvidenceManifest(manifest) {
  const issues = [];
  if (!manifest?.releaseId) issues.push('releaseId required');
  if (!manifest?.commit) issues.push('commit required');
  for (const key of ['schemas', 'migrations', 'fixtures', 'validationReceipts']) if (!Array.isArray(manifest?.[key])) issues.push(`${key} must be an array`);
  if (!manifest?.generatedAt || Number.isNaN(Date.parse(manifest.generatedAt))) issues.push('generatedAt invalid');
  return issues;
}

export function createDiagnosticSurfaceSnapshot({ readiness = [], events = [], scenarioResults = [], provenance = null } = {}) {
  const failures = events.filter((event) => event.level === 'error');
  return Object.freeze({
    schema: 'hearthfire.project-zero-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    readiness,
    lastFailure: failures.at(-1) ?? null,
    scenarioResults,
    provenance,
  });
}
