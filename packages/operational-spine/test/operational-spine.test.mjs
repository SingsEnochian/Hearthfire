import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OperationalEventBuffer,
  OwnerReadinessRegistry,
  createScenarioDefinition,
  foundationalScenarios,
  runProvingScenario,
  createReleaseEvidenceManifest,
  createDiagnosticSurfaceSnapshot,
} from '../src/index.mjs';

test('operational events and owner readiness expose structured truth', () => {
  const events = new OperationalEventBuffer();
  const readiness = new OwnerReadinessRegistry({ events });
  readiness.register({ owner: 'observer', validate: (state) => state?.schema === 'observer/v1' ? [] : ['observer schema invalid'] });
  const rejected = readiness.setState('observer', { schema: 'wrong' });
  assert.equal(rejected.ready, false);
  assert.throws(() => readiness.read('observer'));
  const accepted = readiness.setState('observer', { schema: 'observer/v1' });
  assert.equal(accepted.ready, true);
  assert.equal(readiness.read('observer').schema, 'observer/v1');
  assert.equal(events.latest('observer').event, 'OWNER_READY');
});

const scenarioBehaviours = {
  'refresh.recursion': async ({ state }) => { state.refreshRequests += 1; return { bounded: state.refreshRequests === 1 }; },
  'observer.malformed-state': async () => { throw new Error('malformed observer state rejected'); },
  'commons.persistence-failure': async () => { throw new Error('persistence unavailable'); },
  'runtime.offline-routing': async () => ({ route: 'offline-explicit' }),
  'replay.mismatch': async () => ({ mismatch: true }),
};

for (const seed of foundationalScenarios) {
  test(`proving chamber: ${seed.id}`, async () => {
    const protectedState = { canonical: ['receipt-a'], refreshRequests: 0 };
    const definition = createScenarioDefinition(seed, {
      provenance: { source: 'historical-regression-seed' },
      captureProtectedState: () => ({ canonical: protectedState.canonical }),
      exercise: () => scenarioBehaviours[seed.id]({ state: protectedState }),
      evaluate: ({ outcome, error, mutationDetected }) => ({
        passed: !mutationDetected && Boolean(error || outcome),
        actual: error?.message ?? outcome,
      }),
    });
    const receipt = await runProvingScenario(definition);
    assert.equal(receipt.passed, true);
    assert.equal(receipt.mutationDetected, false);
    assert.equal(receipt.beforeDigest, receipt.afterDigest);
  });
}

test('non-mutation receipt fails a scenario that alters protected state', async () => {
  const state = { committed: 1 };
  const definition = createScenarioDefinition({ id: 'mutation.canary', subsystem: 'test', expected: 'no mutation' }, {
    captureProtectedState: () => state,
    exercise: () => { state.committed = 2; },
    evaluate: () => ({ passed: true, actual: 'operation returned' }),
  });
  const receipt = await runProvingScenario(definition);
  assert.equal(receipt.passed, false);
  assert.equal(receipt.mutationDetected, true);
});

test('release evidence and Project Zero diagnostic snapshot bind runtime proof', () => {
  const manifest = createReleaseEvidenceManifest({
    releaseId: 'operational-spine-v1', commit: 'abc123', schemas: ['operational-event/v1'],
    migrations: [], fixtures: foundationalScenarios.map(({ id }) => id), validationReceipts: ['receipt-1'],
    deployment: { provider: 'test', identity: 'preview' }, provenance: { repo: 'SingsEnochian/Hearthfire' },
  });
  assert.equal(manifest.commit, 'abc123');
  const diagnostics = createDiagnosticSurfaceSnapshot({ readiness: [{ owner: 'observer', ready: true }], scenarioResults: [{ id: 'refresh.recursion', passed: true }], provenance: manifest.provenance });
  assert.equal(diagnostics.readiness[0].ready, true);
  assert.equal(diagnostics.scenarioResults[0].passed, true);
});
