import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const REGISTRY_SCHEMA = 'arkfire.model-foundry-registry/v1';
export const EXPORT_SCHEMA = 'arkfire.model-foundry-export/v1';
export const RECEIPT_SCHEMA = 'arkfire.model-health-receipt/v1';

const DEFAULT_PROVIDERS = Object.freeze([
  {
    providerId: 'ollama.local-primary',
    displayName: 'Ollama Local Primary',
    kind: 'ollama',
    runtime: 'local',
    endpoint: 'http://127.0.0.1:11434',
    enabled: true,
    privacyClass: 'device-local',
    capabilities: ['text', 'model-discovery'],
  },
  {
    providerId: 'ollama.yggdrasil',
    displayName: 'Ollama Yggdrasil',
    kind: 'ollama',
    runtime: 'local',
    endpoint: 'http://127.0.0.1:11435',
    enabled: true,
    privacyClass: 'device-local',
    capabilities: ['text', 'model-discovery'],
  },
  {
    providerId: 'ollama.glm4',
    displayName: 'Ollama GLM-4',
    kind: 'ollama',
    runtime: 'local',
    endpoint: 'http://127.0.0.1:11436',
    enabled: true,
    privacyClass: 'device-local',
    capabilities: ['text', 'model-discovery'],
  },
  {
    providerId: 'ollama.deepseek-r1',
    displayName: 'Ollama DeepSeek R1',
    kind: 'ollama',
    runtime: 'local',
    endpoint: 'http://127.0.0.1:11437',
    enabled: true,
    privacyClass: 'device-local',
    capabilities: ['text', 'reasoning', 'model-discovery'],
  },
]);

export function resolveDataDirectory(explicitDirectory = null) {
  if (explicitDirectory) return resolve(explicitDirectory);
  if (process.env.ARKFIRE_MODEL_FOUNDRY_DATA_DIR) {
    return resolve(process.env.ARKFIRE_MODEL_FOUNDRY_DATA_DIR);
  }
  const appData = process.env.APPDATA;
  if (process.platform === 'win32' && appData) {
    return resolve(appData, 'Arkfire', 'ModelFoundry');
  }
  return resolve(homedir(), '.arkfire', 'model-foundry');
}

export function createDefaultRegistry() {
  const now = new Date().toISOString();
  return {
    schemaVersion: REGISTRY_SCHEMA,
    registryId: 'arkfire.models.local',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    providers: DEFAULT_PROVIDERS.map((provider) => ({ ...provider, models: [], lastHealth: null })),
  };
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function normaliseEndpoint(value) {
  const parsed = new URL(String(value));
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('Provider endpoint must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new TypeError('Provider endpoint must not contain credentials');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function normaliseProvider(input, existing = null) {
  assertPlainObject(input, 'provider');
  const providerId = String(input.providerId ?? existing?.providerId ?? '').trim();
  const displayName = String(input.displayName ?? existing?.displayName ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(providerId)) {
    throw new TypeError('providerId must be 3-81 letters, numbers, dots, underscores, or hyphens');
  }
  if (!displayName) throw new TypeError('displayName is required');

  const kind = String(input.kind ?? existing?.kind ?? 'ollama');
  if (kind !== 'ollama') throw new TypeError('MF-001 supports Ollama provider profiles only');

  return {
    providerId,
    displayName,
    kind,
    runtime: 'local',
    endpoint: normaliseEndpoint(input.endpoint ?? existing?.endpoint),
    enabled: input.enabled === undefined ? (existing?.enabled ?? true) : Boolean(input.enabled),
    privacyClass: 'device-local',
    capabilities: Array.isArray(input.capabilities)
      ? [...new Set(input.capabilities.map(String))]
      : (existing?.capabilities ?? ['text', 'model-discovery']),
    models: Array.isArray(input.models) ? input.models : (existing?.models ?? []),
    lastHealth: input.lastHealth ?? existing?.lastHealth ?? null,
  };
}

export function validateRegistry(input) {
  assertPlainObject(input, 'registry');
  if (input.schemaVersion !== REGISTRY_SCHEMA) {
    throw new TypeError(`Unsupported registry schema: ${input.schemaVersion ?? 'missing'}`);
  }
  if (!Array.isArray(input.providers)) throw new TypeError('registry.providers must be an array');

  const seen = new Set();
  const providers = input.providers.map((provider) => {
    const normalised = normaliseProvider(provider);
    if (seen.has(normalised.providerId)) throw new TypeError(`Duplicate providerId: ${normalised.providerId}`);
    seen.add(normalised.providerId);
    return normalised;
  });

  return {
    schemaVersion: REGISTRY_SCHEMA,
    registryId: String(input.registryId || 'arkfire.models.local'),
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    providers,
  };
}

export class RegistryStore {
  constructor(dataDirectory = null) {
    this.dataDirectory = resolveDataDirectory(dataDirectory);
    this.registryPath = join(this.dataDirectory, 'registry.json');
    this.receiptsPath = join(this.dataDirectory, 'health-receipts.jsonl');
  }

  async init() {
    await mkdir(this.dataDirectory, { recursive: true });
    try {
      return await this.readRegistry();
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const registry = createDefaultRegistry();
      await this.writeRegistry(registry, { incrementRevision: false });
      return registry;
    }
  }

  async readRegistry() {
    const raw = await readFile(this.registryPath, 'utf8');
    return validateRegistry(JSON.parse(raw));
  }

  async writeRegistry(input, { incrementRevision = true } = {}) {
    const registry = validateRegistry(input);
    const previousRevision = Number(registry.revision || 1);
    const next = {
      ...registry,
      revision: incrementRevision ? previousRevision + 1 : previousRevision,
      updatedAt: new Date().toISOString(),
    };
    const temporaryPath = `${this.registryPath}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.registryPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.registryPath);
    return next;
  }

  async upsertProvider(input) {
    const registry = await this.init();
    const index = registry.providers.findIndex((provider) => provider.providerId === input.providerId);
    const existing = index >= 0 ? registry.providers[index] : null;
    const provider = normaliseProvider(input, existing);
    const providers = [...registry.providers];
    if (index >= 0) providers[index] = provider;
    else providers.push(provider);
    return this.writeRegistry({ ...registry, providers });
  }

  async removeProvider(providerId) {
    const registry = await this.init();
    const providers = registry.providers.filter((provider) => provider.providerId !== providerId);
    if (providers.length === registry.providers.length) return { registry, removed: false };
    return { registry: await this.writeRegistry({ ...registry, providers }), removed: true };
  }

  async applyProbeResults(results) {
    const registry = await this.init();
    const byId = new Map(results.map((result) => [result.providerId, result]));
    const providers = registry.providers.map((provider) => {
      const result = byId.get(provider.providerId);
      if (!result) return provider;
      return {
        ...provider,
        models: result.models,
        lastHealth: {
          status: result.status,
          checkedAt: result.checkedAt,
          latencyMs: result.latencyMs,
          error: result.error,
        },
      };
    });
    const next = await this.writeRegistry({ ...registry, providers });
    for (const result of results) await this.appendHealthReceipt(result);
    return next;
  }

  async appendHealthReceipt(result) {
    const receipt = {
      schemaVersion: RECEIPT_SCHEMA,
      receiptId: randomUUID(),
      moduleId: 'arkfire.models',
      providerId: result.providerId,
      status: result.status,
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      modelCount: result.models.length,
      error: result.error,
      sourceProvenance: 'provider-health-probe',
      consentScope: 'configured-provider-endpoint',
      authority: 'DIRECT_MEASUREMENT',
    };
    await appendFile(this.receiptsPath, `${JSON.stringify(receipt)}\n`, 'utf8');
    return receipt;
  }

  async readReceipts(limit = 500) {
    try {
      const raw = await readFile(this.receiptsPath, 'utf8');
      return raw.split(/\r?\n/).filter(Boolean).slice(-limit).map((line) => JSON.parse(line));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async exportBundle() {
    return {
      schemaVersion: EXPORT_SCHEMA,
      exportedAt: new Date().toISOString(),
      moduleId: 'arkfire.models',
      registry: await this.init(),
      healthReceipts: await this.readReceipts(),
      secretsIncluded: false,
    };
  }

  async importBundle(bundle) {
    assertPlainObject(bundle, 'import bundle');
    if (bundle.schemaVersion !== EXPORT_SCHEMA) {
      throw new TypeError(`Unsupported export schema: ${bundle.schemaVersion ?? 'missing'}`);
    }
    const registry = validateRegistry(bundle.registry);
    const written = await this.writeRegistry(registry, { incrementRevision: false });
    if (Array.isArray(bundle.healthReceipts)) {
      const lines = bundle.healthReceipts
        .filter((receipt) => receipt?.schemaVersion === RECEIPT_SCHEMA)
        .map((receipt) => JSON.stringify(receipt));
      await writeFile(this.receiptsPath, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
    }
    return written;
  }
}
