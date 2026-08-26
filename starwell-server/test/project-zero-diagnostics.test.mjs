import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildProjectZeroDiagnostics } from '../project-zero-diagnostics.mjs';

const scenarioIds = [
  'refresh.recursion',
  'observer.malformed-state',
  'commons.persistence-failure',
  'runtime.offline-routing',
  'replay.mismatch',
];

async function makeRoot({ deployedCommit = 'fixture-commit' } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), 'hearthfire-pz-diagnostics-'));
  await mkdir(resolve(root, 'packages/operational-spine/src'), { recursive: true });
  for (const file of ['operational-events.mjs', 'owner-readiness.mjs', 'proving-chamber.mjs', 'release-evidence.mjs']) {
    await writeFile(resolve(root, 'packages/operational-spine/src', file), '// fixture\n', 'utf8');
  }
  await mkdir(resolve(root, 'release-evidence'), { recursive: true });
  await writeFile(
    resolve(root, 'release-evidence/hearthfire-operational-spine-v1.json'),
    JSON.stringify({
      schema: 'hearthfire.release-evidence/v1',
      releaseId: 'fixture-release',
      commit: 'fixture-commit',
      generatedAt: '2026-08-26T21:00:14.319Z',
      deployment: {
        provider: 'test',
        environment: 'preview',
        deploymentId: 'fixture-deployment',
        deployedCommit,
        deployedAt: '2026-08-26T21:00:30.000Z',
      },
      validationReceipts: scenarioIds.map((scenarioId) => ({
        schema: 'hearthfire.proving-receipt/v1',
        scenarioId,
        subsystem: scenarioId,
        passed: true,
        mutationDetected: false,
        actual: 'fixture-pass',
      })),
      provenance: { requiredScenarioIds: scenarioIds },
    }),
    'utf8',
  );
  await mkdir(resolve(root, 'data'), { recursive: true });
  return root;
}

test('diagnostics expose bound release evidence and passing deployment parity', async () => {
  const root = await makeRoot();
  const diagnostics = await buildProjectZeroDiagnostics({
    rootDirectory: root,
    dataDirectory: resolve(root, 'data'),
    diagnosticsCommit: 'fixture-commit',
  });
  assert.equal(diagnostics.schema, 'hearthfire.project-zero-diagnostics/v1');
  assert.equal(diagnostics.ready, true);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'operational-spine').ready, true);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'continuity-replay').ready, true);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'release-evidence').ready, true);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'deployment-evidence-parity').ready, true);
  assert.equal(diagnostics.releaseEvidence.present, true);
  assert.equal(diagnostics.releaseEvidence.ready, true);
  assert.equal(diagnostics.releaseEvidence.releaseId, 'fixture-release');
  assert.equal(diagnostics.releaseEvidence.commit, 'fixture-commit');
  assert.equal(diagnostics.releaseEvidence.receiptCount, 5);
  assert.deepEqual(diagnostics.releaseEvidence.requiredScenarioIds, scenarioIds);
  assert.equal(diagnostics.deploymentParity.passed, true);
  assert.deepEqual(diagnostics.scenarioResults.map((item) => item.scenarioId), [...scenarioIds, 'deployment.evidence-parity']);
});

test('diagnostics fail closed when deployment parity diverges', async () => {
  const root = await makeRoot({ deployedCommit: 'other-commit' });
  const diagnostics = await buildProjectZeroDiagnostics({
    rootDirectory: root,
    dataDirectory: resolve(root, 'data'),
    diagnosticsCommit: 'fixture-commit',
  });
  assert.equal(diagnostics.ready, false);
  assert.equal(diagnostics.deploymentParity.passed, false);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'deployment-evidence-parity').ready, false);
});

test('diagnostics fail closed when release evidence is absent', async () => {
  const root = await makeRoot();
  await writeFile(resolve(root, 'release-evidence/hearthfire-operational-spine-v1.json'), '{"schema":"wrong"}', 'utf8');
  const diagnostics = await buildProjectZeroDiagnostics({
    rootDirectory: root,
    dataDirectory: resolve(root, 'data'),
    diagnosticsCommit: 'fixture-commit',
  });
  assert.equal(diagnostics.ready, false);
  assert.equal(diagnostics.releaseEvidence.ready, false);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'release-evidence').ready, false);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'deployment-evidence-parity').ready, false);
});
