import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectZeroCapabilities } from '../project-zero-capabilities.mjs';

test('Project Zero capabilities advertise stable read-only Hearthfire contracts', () => {
  const result = buildProjectZeroCapabilities();
  assert.equal(result.schema, 'hearthfire.project-zero-capabilities/v1');
  assert.equal(result.provider.id, 'hearthfire.starwell');
  assert.equal(result.compatibility.mode, 'read-contract-first');
  assert.equal(result.capabilities.every((capability) => capability.mutates === false), true);
  assert.equal(result.capabilities.some((capability) => capability.route === '/api/project-zero/diagnostics'), true);
  assert.equal(result.capabilities.some((capability) => capability.schema === 'hearthfire.operational-event/v1'), true);
  assert.equal(result.lanternbridge.relationship, 'compatible-peer-boundary');
});
