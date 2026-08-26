import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildProjectZeroDiagnostics } from '../project-zero-diagnostics.mjs';

async function makeRoot() {
  const root = await mkdtemp(resolve(tmpdir(), 'hearthfire-pz-diagnostics-'));
  await mkdir(resolve(root, 'packages/operational-spine/src'), { recursive: true });
  for (const file of ['operational-events.mjs', 'owner-readiness.mjs', 'proving-chamber.mjs', 'release-evidence.mjs']) {
    await writeFile(resolve(root, 'packages/operational-spine/src', file), '// fixture\n', 'utf8');
  }
  await mkdir(resolve(root, 'release-evidence'), { recursive: true });
  await writeFile(resolve(root, 'release-evidence/project-zero-operational-spine-v1.json'), JSON.stringify({ schema: 'hearthfire.release-evidence/v1', commit: 'fixture' }), 'utf8');
  await mkdir(resolve(root, 'data'), { recursive: true });
  return root;
}

test('diagnostics aggregate operational-spine readiness and empty replay as ready', async () => {
  const root = await makeRoot();
  const diagnostics = await buildProjectZeroDiagnostics({ rootDirectory: root, dataDirectory: resolve(root, 'data') });
  assert.equal(diagnostics.schema, 'hearthfire.project-zero-diagnostics/v1');
  assert.equal(diagnostics.ready, true);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'operational-spine').ready, true);
  assert.equal(diagnostics.subsystems.find((item) => item.id === 'continuity-replay').ready, true);
  assert.equal(diagnostics.releaseEvidence.present, true);
});
