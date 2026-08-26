import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  rootDirectory = resolve(new URL('..', import.meta.url).pathname),
  dataDirectory = resolve(new URL('./data', import.meta.url).pathname),
} = {}) {
  const continuity = new ContinuityExporter({ dataDirectory });
  const replay = await verifyContinuityReplay(continuity);
  const evidencePath = resolve(rootDirectory, 'release-evidence/project-zero-operational-spine-v1.json');
  const evidence = await readOptionalJson(evidencePath);
  const artifacts = await Promise.all([
    filePresence(resolve(rootDirectory, 'packages/operational-spine/src/operational-events.mjs')),
    filePresence(resolve(rootDirectory, 'packages/operational-spine/src/owner-readiness.mjs')),
    filePresence(resolve(rootDirectory, 'packages/operational-spine/src/proving-chamber.mjs')),
    filePresence(resolve(rootDirectory, 'packages/operational-spine/src/release-evidence.mjs')),
  ]);

  const artifactReady = artifacts.every((item) => item.present);
  const replayReady = replay.matches || (replay.expectedPacketId === null && replay.replayPacketId === null);
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
  ];

  return {
    schema: 'hearthfire.project-zero-diagnostics/v1',
    generatedAt: new Date().toISOString(),
    ready: subsystems.every((subsystem) => subsystem.ready),
    subsystems,
    scenarioResults: [
      {
        scenarioId: 'replay.mismatch',
        subsystem: 'continuity.replay',
        passed: replayReady,
        mutationDetected: false,
        actual: replayReady ? 'continuity replay consistent' : 'continuity replay mismatch detected',
        provenance: { contract: replay.schema },
      },
    ],
    releaseEvidence: evidence
      ? { present: true, schema: evidence.schema ?? null, commit: evidence.commit ?? null, path: evidencePath }
      : { present: false, schema: null, commit: null, path: evidencePath },
    provenance: {
      source: 'STARWELL diagnostics aggregator',
      ownership: 'read-only aggregation; subsystem owners remain authoritative',
    },
  };
}
