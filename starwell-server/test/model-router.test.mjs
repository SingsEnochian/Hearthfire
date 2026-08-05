import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, createModelRouter, ROUTE_MODE } from '../routing/model-router.mjs';

const policy = {
  mode: ROUTE_MODE.LOCAL_FIRST,
  allowedProviders: ['local', 'google-gateway'],
  virtualModels: {
    coding: [
      { provider: 'google-gateway', model: 'claude-opus-4-7', priority: 20 },
      { provider: 'local', model: 'qwen3-coder', priority: 10 }
    ]
  }
};

test('local-first sorts local before cloud', () => {
  const plan = buildPlan({ virtualModel: 'coding' }, policy, { local: {}, 'google-gateway': {} });
  assert.equal(plan[0].provider, 'local');
});

test('LOCAL_ONLY data cannot leave the machine', () => {
  const plan = buildPlan({ virtualModel: 'coding', dataClass: 'LOCAL_ONLY' }, policy, { local: {}, 'google-gateway': {} });
  assert.deepEqual(plan.map(x => x.provider), ['local']);
});

test('router fails over and records selected route', async () => {
  const receipts = [];
  const router = createModelRouter({
    providers: {
      local: { invoke: async () => { throw new Error('offline'); } },
      'google-gateway': { invoke: async request => ({ model: request.model, answer: 'ok' }) }
    },
    routeStore: { append: async receipt => receipts.push(receipt) },
    clock: () => new Date('2026-08-05T13:31:00.000Z')
  });
  const { result, receipt } = await router.route({ agentId: 'uial', virtualModel: 'coding', messages: [] }, policy);
  assert.equal(result.answer, 'ok');
  assert.equal(receipt.selectedProvider, 'google-gateway');
  assert.equal(receipt.attempts[0].status, 'ERROR');
  assert.equal(receipts.length, 1);
});
