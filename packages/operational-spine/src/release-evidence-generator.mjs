import { createReleaseEvidenceManifest } from './release-evidence.mjs';

export const REQUIRED_PROVING_SCENARIOS = Object.freeze([
  'refresh.recursion',
  'observer.malformed-state',
  'commons.persistence-failure',
  'runtime.offline-routing',
  'replay.mismatch',
]);

function normalizeReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') throw new TypeError('proving receipt must be an object');
  if (receipt.schema !== 'hearthfire.proving-receipt/v1') throw new TypeError(`unsupported proving receipt schema: ${receipt.schema ?? 'missing'}`);
  if (!receipt.scenarioId) throw new TypeError('proving receipt scenarioId required');
  return receipt;
}

export function validateProvingReceiptSet(receipts, requiredScenarioIds = REQUIRED_PROVING_SCENARIOS) {
  if (!Array.isArray(receipts)) return ['proving receipts must be an array'];
  const issues = [];
  const byScenario = new Map();

  for (const raw of receipts) {
    let receipt;
    try { receipt = normalizeReceipt(raw); }
    catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (byScenario.has(receipt.scenarioId)) issues.push(`duplicate proving receipt: ${receipt.scenarioId}`);
    else byScenario.set(receipt.scenarioId, receipt);
  }

  for (const scenarioId of requiredScenarioIds) {
    const receipt = byScenario.get(scenarioId);
    if (!receipt) {
      issues.push(`missing proving receipt: ${scenarioId}`);
      continue;
    }
    if (receipt.passed !== true) issues.push(`proving scenario did not pass: ${scenarioId}`);
    if (receipt.mutationDetected === true) issues.push(`protected-state mutation detected: ${scenarioId}`);
  }

  return issues;
}

export function generateReleaseEvidence({
  releaseId,
  commit,
  provingReceipts,
  schemas = [],
  migrations = [],
  fixtures = [],
  deployment = null,
  provenance = null,
  generatedAt,
  requiredScenarioIds = REQUIRED_PROVING_SCENARIOS,
} = {}) {
  const issues = validateProvingReceiptSet(provingReceipts, requiredScenarioIds);
  if (issues.length) throw new TypeError(`Invalid proving receipt set: ${issues.join('; ')}`);

  return createReleaseEvidenceManifest({
    releaseId,
    commit,
    schemas,
    migrations,
    fixtures,
    validationReceipts: provingReceipts.map((receipt) => Object.freeze({ ...receipt })),
    deployment,
    provenance: {
      source: '@hearthfire/operational-spine',
      contract: 'hearthfire.release-evidence/v1',
      requiredScenarioIds: [...requiredScenarioIds],
      ...(provenance ?? {}),
    },
    generatedAt,
  });
}

export function serializeReleaseEvidence(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
