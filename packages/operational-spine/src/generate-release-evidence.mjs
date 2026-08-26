import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  proveRefreshRecursionBoundedNonMutation,
  proveMalformedObserverStateNonMutation,
  proveCommonsPersistenceFailureNonMutation,
  RuntimeRouteOwner,
  proveRuntimeOfflineRoutingNonMutation,
  generateReleaseEvidence,
  serializeReleaseEvidence,
} from './index.mjs';
import { proveContinuityReplayMismatchNonMutation } from '../../bridge-session/src/continuity-replay-proof.mjs';

const outputPath = resolve(process.env.HEARTHFIRE_RELEASE_EVIDENCE_PATH || 'release-evidence/hearthfire-operational-spine-v1.json');
const releaseId = process.env.HEARTHFIRE_RELEASE_ID || `hearthfire-${process.env.GITHUB_RUN_ID || 'local'}`;
const commit = process.env.GITHUB_SHA || process.env.HEARTHFIRE_COMMIT || 'local-unbound';

const observerInitialState = Object.freeze({ P: 0.8, C: 0.8, R: 0.8, E: 0.2, M: 0.8, A: 0.8, Q: 0.8 });
const observerMalformedState = Object.freeze({ P: 0.8, C: 0.8, R: 0.8, E: 0.2, M: 0.8, A: 0.8 });

async function main() {
  const receipts = [];
  receipts.push(await proveRefreshRecursionBoundedNonMutation());
  receipts.push(await proveMalformedObserverStateNonMutation({
    initialState: observerInitialState,
    malformedState: observerMalformedState,
  }));
  receipts.push(await proveCommonsPersistenceFailureNonMutation());

  const routeOwner = new RuntimeRouteOwner({
    routes: {
      primary: { online: false },
      fallback: { online: true },
    },
    fallbackRoute: 'fallback',
  });
  receipts.push(await proveRuntimeOfflineRoutingNonMutation(routeOwner, 'primary'));

  const canonicalPacket = Object.freeze({ continuity_packet_id: 'release-evidence-canonical', world: 'terra-prime', revision: 1 });
  const mismatchPacket = Object.freeze({ continuity_packet_id: 'release-evidence-mismatch', world: 'terra-prime', revision: 0 });
  const replayExporter = {
    async latest() { return canonicalPacket; },
    async replay() { return [mismatchPacket]; },
  };
  receipts.push(await proveContinuityReplayMismatchNonMutation(replayExporter));

  const manifest = generateReleaseEvidence({
    releaseId,
    commit,
    provingReceipts: receipts,
    schemas: [
      'hearthfire.operational-event/v1',
      'hearthfire.proving-receipt/v1',
      'hearthfire.release-evidence/v1',
    ],
    provenance: {
      source: '@hearthfire/operational-spine',
      workflow: process.env.GITHUB_WORKFLOW || 'local',
      runId: process.env.GITHUB_RUN_ID || null,
    },
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeReleaseEvidence(manifest), 'utf8');
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
