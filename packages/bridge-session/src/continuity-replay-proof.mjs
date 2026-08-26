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
  const mismatchSurfaced = verification.matches === false;
  const mutationDetected = beforeDigest !== afterDigest;
  const passed = mismatchSurfaced && !mutationDetected;
  return Object.freeze({
    schema: 'hearthfire.proving-receipt/v1',
    scenarioId: 'replay.mismatch',
    subsystem: 'continuity.replay',
    expected: 'replay mismatch is surfaced and canonical latest state is not mutated',
    passed,
    mutationDetected,
    beforeDigest,
    afterDigest,
    actual: mismatchSurfaced ? 'replay mismatch detected' : 'replay unexpectedly matched latest continuity packet',
    issues: [
      ...(mismatchSurfaced ? [] : ['continuity replay unexpectedly matched latest continuity packet']),
      ...(mutationDetected ? ['canonical latest continuity state mutated during mismatch verification'] : []),
    ],
    provenance: { source: '@hearthfire/bridge-session', contract: 'hearthfire.replay-verification/v1' },
    completedAt: new Date().toISOString(),
  });
}
