import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyContinuityReplay } from '../packages/bridge-session/src/continuity-replay-proof.mjs';
import { ContinuityExporter } from '../packages/bridge-session/src/continuity-exporter.mjs';

async function filePresence(path) {
  try {
    await access(path);
    return { path, present: true };
  } catch {
    return { path, present: false };
  }
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export async function buildProjectZeroDiagnostics({
  rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url))),
  dataDirectory = resolve(fileURLToPath(new URL('./data', import.meta.url))),
} = {}) {
  const continuity = new ContinuityExporter({ dataDirectory });
  const replay = await verifyContinuityReplay(continuity);
  const evidencePath = resolve(rootDirectory, 'release-evidence/hearthfire-operational-spine-v1.json');
  const evidence = await readOptionalJson(evidencePath);
  const artifacts = await Promise.all([
    filePresence(resolve(rootDirectory, 'packages/operational-spine/src/operational-events.mjs')),
    filePresence(resolve(rootDirectory, 'packages/operational-spine/src/owner-readiness.mjs')),
    filePresence(resolve(rootDirectory, 'packages/operational-spine/src/proving-chamber.mjs')),
    filePresence(resolve(rootDirectory, 'packages/operational-spine/src/release-evidence.mjs')),
  ]);

  const artifactReady = artifacts.every((item) => item.present);
  const replayReady = replay.matches || (replay.expectedPacketId === null && replay.replayPacketId === null);
  const evidenceReceipts = Array.isArray(evidence?.validationReceipts) ? evidence.validationReceipts : [];
  const evidenceReady = evidence?.schema === 'hearthfire.release-evidence/v1'
    && evidenceReceipts.length > 0
    && evidenceReceipts.every((receipt) => receipt?.passed === true && receipt?.mutationDetected !== true);

  const subsystems = [
    {
      id: 'operational-spine',
      ready: artifactReady,
      lastFailure: artifactReady ? null : { code: 'OPERATIONAL_SPINE_ARTIFACT_MISSING', artifacts },
      provenance: { source: 'Hearthfire/packages/operational-spine', contract: 'hearthfire.operational-event/v1' },
    },
    {
      id: 'continuity-replay',
      ready: replayReady,
      lastFailure: replayReady ? null : { code: 'CONTINUITY_REPLAY_MISMATCH', replay },
      provenance: { source: '@hearthfire/bridge-session', contract: replay.schema },
    },
    {
      id: 'release-evidence',
      ready: evidenceReady,
      lastFailure: evidenceReady ? null : { code: 'RELEASE_EVIDENCE_UNAVAILABLE_OR_INVALID', path: evidencePath },
      provenance: { source: evidencePath, contract: 'hearthfire.release-evidence/v1' },
    },
  ];

  return {
    schema: 'hearthfire.project-zero-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    ready: subsystems.every((subsystem) => subsystem.ready),
    subsystems,
    scenarioResults: evidenceReceipts.map((receipt) => ({
      scenarioId: receipt.scenarioId,
      subsystem: receipt.subsystem,
      passed: receipt.passed === true,
      mutationDetected: receipt.mutationDetected === true,
      actual: receipt.actual ?? null,
      provenance: receipt.provenance ?? null,
    })),
    replayHealth: {
      consistent: replayReady,
      verification: replay,
    },
    releaseEvidence: evidence
      ? {
          present: true,
          ready: evidenceReady,
          schema: evidence.schema ?? null,
          releaseId: evidence.releaseId ?? null,
          commit: evidence.commit ?? null,
          generatedAt: evidence.generatedAt ?? null,
          receiptCount: evidenceReceipts.length,
          requiredScenarioIds: evidence.provenance?.requiredScenarioIds ?? [],
          path: evidencePath,
        }
      : {
          present: false,
          ready: false,
          schema: null,
          releaseId: null,
          commit: null,
          generatedAt: null,
          receiptCount: 0,
          requiredScenarioIds: [],
          path: evidencePath,
        },
    provenance: {
      source: 'STARWELL diagnostics aggregator',
      ownership: 'read-only aggregation; subsystem owners remain authoritative',
    },
  };
}
