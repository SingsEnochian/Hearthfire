import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  proveRefreshRecursionNonMutation,
  proveObserverMalformedStateNonMutation,
  proveCommonsPersistenceFailureNonMutation,
  proveRuntimeOfflineRoutingNonMutation,
  proveContinuityReplayMismatchNonMutation,
  createReleaseEvidenceFromProvingReceipts,
  stringifyReleaseEvidence,
} from './index.mjs';
import { ContinuityExporter } from '../../bridge-session/src/continuity-exporter.mjs';

const outputPath = resolve(process.env.HEARTHFIRE_RELEASE_EVIDENCE_PATH || 'release-evidence/hearthfire-operational-spine-v1.json');
const releaseId = process.env.HEARTHFIRE_RELEASE_ID || `hearthfire-${process.env.GITHUB_RUN_ID || 'local'}`;
const commit = process.env.GITHUB_SHA || process.env.HEARTHFIRE_COMMIT || 'local-unbound';

async function main() {
  const receipts = [];
  receipts.push(await proveRefreshRecursionNonMutation());
  receipts.push(await proveObserverMalformedStateNonMutation());
  receipts.push(await proveCommonsPersistenceFailureNonMutation());
  receipts.push(await proveRuntimeOfflineRoutingNonMutation());

  const exporter = new ContinuityExporter({ dataDirectory: resolve('.tmp-release-evidence-continuity') });
  receipts.push(await proveContinuityReplayMismatchNonMutation(exporter));

  const manifest = createReleaseEvidenceFromProvingReceipts({
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
  await writeFile(outputPath, stringifyReleaseEvidence(manifest), 'utf8');
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
