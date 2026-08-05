import { randomUUID } from 'node:crypto';

export const ROUTE_MODE = Object.freeze({ LOCAL_FIRST: 'LOCAL_FIRST', CLOUD_FIRST: 'CLOUD_FIRST', PINNED: 'PINNED' });

export function createModelRouter({ providers, routeStore, clock = () => new Date() }) {
  if (!providers || typeof providers !== 'object') throw new TypeError('providers registry is required');
  if (!routeStore?.append) throw new TypeError('routeStore must implement append()');

  return {
    async route(request, policy) {
      const plan = buildPlan(request, policy, providers);
      const routeId = randomUUID();
      const attempts = [];

      for (const candidate of plan) {
        const startedAt = clock().toISOString();
        try {
          const result = await providers[candidate.provider].invoke({ ...request, model: candidate.model });
          const receipt = {
            routeId,
            agentId: request.agentId,
            virtualModel: request.virtualModel,
            selectedProvider: candidate.provider,
            selectedModel: candidate.model,
            attempts: [...attempts, { ...candidate, startedAt, status: 'OK' }],
            reason: candidate.reason,
            createdAt: clock().toISOString()
          };
          await routeStore.append(receipt);
          return { result, receipt };
        } catch (error) {
          attempts.push({ ...candidate, startedAt, status: 'ERROR', error: String(error?.message || error) });
        }
      }

      const receipt = {
        routeId,
        agentId: request.agentId,
        virtualModel: request.virtualModel,
        selectedProvider: null,
        selectedModel: null,
        attempts,
        reason: 'All permitted routes failed.',
        createdAt: clock().toISOString()
      };
      await routeStore.append(receipt);
      throw Object.assign(new Error('All permitted model routes failed'), { receipt });
    }
  };
}

export function buildPlan(request, policy = {}, providers = {}) {
  const virtual = request.virtualModel || 'general';
  const routes = policy.virtualModels?.[virtual];
  if (!routes?.length) throw new Error(`No routes configured for virtual model ${virtual}`);

  const allowedProviders = new Set(policy.allowedProviders || Object.keys(providers));
  const deniedModels = new Set(policy.deniedModels || []);
  const candidates = routes
    .filter(route => providers[route.provider])
    .filter(route => allowedProviders.has(route.provider))
    .filter(route => !deniedModels.has(`${route.provider}/${route.model}`))
    .filter(route => request.dataClass !== 'LOCAL_ONLY' || route.provider === 'local')
    .map(route => ({ ...route, reason: route.reason || `Configured route for ${virtual}` }));

  if (policy.mode === ROUTE_MODE.PINNED) {
    const pin = policy.pinned?.[virtual];
    return candidates.filter(route => `${route.provider}/${route.model}` === pin);
  }

  const locality = route => route.provider === 'local' ? 0 : 1;
  if (policy.mode === ROUTE_MODE.CLOUD_FIRST) candidates.sort((a, b) => locality(b) - locality(a) || (a.priority ?? 100) - (b.priority ?? 100));
  else candidates.sort((a, b) => locality(a) - locality(b) || (a.priority ?? 100) - (b.priority ?? 100));

  return candidates;
}

export function createOpenAICompatibleProvider({ baseUrl, apiKey, fetchImpl = fetch, headers = {} }) {
  return {
    async invoke(request) {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...headers
        },
        body: JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature })
      });
      if (!response.ok) throw new Error(`Model gateway HTTP ${response.status}`);
      return response.json();
    }
  };
}
