function modelProfile(providerId, raw) {
  const name = String(raw?.name || raw?.model || '').trim();
  const cloudRouted = /(^|[:._-])cloud($|[:._-])/i.test(name);
  return {
    modelId: `${providerId}::${name}`,
    providerId,
    name,
    runtime: cloudRouted ? 'cloud-via-local-router' : 'local',
    privacyClass: cloudRouted ? 'external-processing-possible' : 'device-local',
    sizeBytes: Number.isFinite(raw?.size) ? raw.size : null,
    digest: raw?.digest || null,
    modifiedAt: raw?.modified_at || null,
    details: raw?.details && typeof raw.details === 'object' ? raw.details : null,
    capabilities: ['text'],
    availability: 'available',
    routeWarning: cloudRouted ? 'The model tag indicates cloud routing. Invocation requires explicit external-processing consent.' : null,
  };
}

export async function probeOllamaProvider(provider, { timeoutMs = 5000, fetchImpl = fetch } = {}) {
  const checkedAt = new Date().toISOString();
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${provider.endpoint}/api/tags`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      return {
        providerId: provider.providerId,
        status: 'unavailable',
        checkedAt,
        latencyMs,
        models: [],
        error: `HTTP ${response.status}`,
      };
    }

    const body = await response.json();
    const models = Array.isArray(body?.models)
      ? body.models.map((entry) => modelProfile(provider.providerId, entry)).filter((entry) => entry.name)
      : [];

    return {
      providerId: provider.providerId,
      status: 'available',
      checkedAt,
      latencyMs,
      models,
      error: null,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    return {
      providerId: provider.providerId,
      status: 'unavailable',
      checkedAt,
      latencyMs,
      models: [],
      error: error?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeProviders(providers, options = {}) {
  const enabled = providers.filter((provider) => provider.enabled && provider.kind === 'ollama');
  return Promise.all(enabled.map((provider) => probeOllamaProvider(provider, options)));
}
