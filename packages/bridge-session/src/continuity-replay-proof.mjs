import { readFile } from 'node:fs/promises';
import { stateDigest } from '../../operational-spine/src/proving-chamber.mjs';

export async function verifyContinuityReplay(exporter) {
  const ledger = await exporter.replay();
  const latest = await exporter.latest();
  const ledgerLatest = ledger.at(-1) ?? null;
  const expectedDigest = stateDigest(latest);
  const replayDigest = stateDigest(ledgerLatest);
  const matches = Boolean(latest) === Boolean(ledgerLatest) && expectedDigest === replayDigest;
  return {
    schema: 'hearthfire.replay-verification/v1',
    subsystem: 'continuity.replay',
    matches,
    expectedDigest,
    replayDigest,
    expectedPacketId: latest?.continuity_packet_id ?? null,
    replayPacketId: ledgerLatest?.continuity_packet_id ?? null,
    checkedAt: new Date().toISOString(),
  };
}

export async function proveContinuityReplayMismatchNonMutation(exporter) {
  const before = await exporter.latest();
  const beforeDigest = stateDigest(before);
  const verification = await verifyContinuityReplay(exporter);
  const after = await exporter.latest();
  const afterDigest = stateDigest(after);
  return Object.freeze({
    schema: 'hearthfire.proving-receipt/v1',
    scenarioId: 'replay.mismatch',
    subsystem: 'continuity.replay',
    expected: 'replay mismatch is surfaced and canonical latest state is not mutated',
    passed: verification.matches && beforeDigest === afterDigest,
    mutationDetected: beforeDigest !== afterDigest,
    beforeDigest,
    afterDigest,
    actual: verification.matches ? 'replay matches latest continuity packet' : 'replay mismatch detected',
    issues: verification.matches ? [] : ['continuity replay does not match latest continuity packet'],
    provenance: { source: '@hearthfire/bridge-session', contract: 'hearthfire.replay-verification/v1' },
    completedAt: new Date().toISOString(),
  });
}
