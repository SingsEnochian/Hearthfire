import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const REGISTRY_SCHEMA = 'arkfire.model-foundry-registry/v1';
export const EXPORT_SCHEMA = 'arkfire.model-foundry-export/v1';
export const RECEIPT_SCHEMA = 'arkfire.model-health-receipt/v1';

const PROVIDER_KINDS = new Set(['ollama', 'openai', 'anthropic', 'deepseek']);

const DEFAULT_PROVIDERS = Object.freeze([
  {
    providerId: 'ollama.local-primary',
    displayName: 'Local Model Fleet',
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
  if (process.env.ARKFIRE_MODEL_FOUNDRY_DATA_DIR) return resolve(process.env.ARKFIRE_MODEL_FOUNDRY_DATA_DIR);
  const appData = process.env.APPDATA;
  if (process.platform === 'win32' && appData) return resolve(appData, 'Arkfire', 'ModelFoundry');
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
    providers: DEFAULT_PROVIDERS.map((provider) => ({
      ...provider,
      models: [],
      lastHealth: null,
      credentialRef: null,
      credentialStatus: 'not-required',
      residentHints: [],
    })),
    integrationCandidates: [],
  };
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}

function normaliseEndpoint(value) {
  const parsed = new URL(String(value));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('Provider endpoint must use http or https');
  if (parsed.username || parsed.password) throw new TypeError('Provider endpoint must not contain credentials');
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function stringArray(value, fallback = []) {
  return Array.isArray(value) ? [...new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean))] : [...fallback];
}

function normaliseModels(value, providerId) {
  if (!Array.isArray(value)) return [];
  return value.map((model) => {
    assertPlainObject(model, 'model');
    const name = String(model.name || '').trim();
    if (!name) throw new TypeError('model.name is required');
    return {
      modelId: String(model.modelId || `${providerId}::${name}`),
      providerId,
      name,
      runtime: String(model.runtime || 'local'),
      privacyClass: String(model.privacyClass || 'device-local'),
      sizeBytes: Number.isFinite(model.sizeBytes) ? model.sizeBytes : null,
      digest: model.digest ? String(model.digest) : null,
      modifiedAt: model.modifiedAt ? String(model.modifiedAt) : null,
      details: model.details && typeof model.details === 'object' && !Array.isArray(model.details) ? model.details : null,
      capabilities: stringArray(model.capabilities, ['text']),
      availability: String(model.availability || 'unknown'),
    };
  });
}

export function normaliseProvider(input, existing = null) {
  assertPlainObject(input, 'provider');
  if ('secretValue' in input || 'apiKey' in input) throw new TypeError('Provider registry must not contain raw credentials');

  const providerId = String(input.providerId ?? existing?.providerId ?? '').trim();
  const displayName = String(input.displayName ?? existing?.displayName ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(providerId)) {
    throw new TypeError('providerId must be 3-81 letters, numbers, dots, underscores, or hyphens');
  }
  if (!displayName) throw new TypeError('displayName is required');

  const kind = String(input.kind ?? existing?.kind ?? 'ollama');
  if (!PROVIDER_KINDS.has(kind)) throw new TypeError(`Unsupported provider kind: ${kind}`);
  const runtime = kind === 'ollama' ? 'local' : 'cloud';
  const defaultCapabilities = kind === 'ollama' ? ['text', 'model-discovery'] : ['text'];
  const credentialRef = input.credentialRef ?? existing?.credentialRef ?? null;

  return {
    providerId,
    displayName,
    kind,
    runtime,
    endpoint: normaliseEndpoint(input.endpoint ?? existing?.endpoint),
    enabled: input.enabled === undefined ? (existing?.enabled ?? kind === 'ollama') : Boolean(input.enabled),
    privacyClass: runtime === 'local' ? 'device-local' : 'external-processing',
    capabilities: stringArray(input.capabilities, existing?.capabilities ?? defaultCapabilities),
    models: normaliseModels(input.models ?? existing?.models ?? [], providerId),
    lastHealth: input.lastHealth ?? existing?.lastHealth ?? null,
    credentialRef: credentialRef ? String(credentialRef) : null,
    credentialStatus: String(input.credentialStatus ?? existing?.credentialStatus ?? (kind === 'ollama' ? 'not-required' : 'missing')),
    credentialImportedAt: input.credentialImportedAt ?? existing?.credentialImportedAt ?? null,
    residentHints: stringArray(input.residentHints, existing?.residentHints ?? []),
    sourceLabel: input.sourceLabel ? String(input.sourceLabel) : (existing?.sourceLabel ?? null),
    invocationLocked: input.invocationLocked === undefined ? (existing?.invocationLocked ?? kind !== 'ollama') : Boolean(input.invocationLocked),
  };
}

export function normaliseIntegrationCandidate(input, existing = null) {
  assertPlainObject(input, 'integration candidate');
  if ('secretValue' in input || 'apiKey' in input) throw new TypeError('Integration metadata must not contain raw credentials');
  const integrationId = String(input.integrationId ?? existing?.integrationId ?? '').trim();
  const displayName = String(input.displayName ?? existing?.displayName ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,100}$/i.test(integrationId)) throw new TypeError('integrationId is invalid');
  if (!displayName) throw new TypeError('integration displayName is required');
  const refs = input.credentialRefs ?? existing?.credentialRefs ?? {};
  assertPlainObject(refs, 'credentialRefs');
  const credentialRefs = Object.fromEntries(
    Object.entries(refs).filter(([, value]) => value).map(([slot, value]) => [String(slot), String(value)]),
  );
  return {
    integrationId,
    displayName,
    kind: String(input.kind ?? existing?.kind ?? 'external-service'),
    endpoint: input.endpoint ? normaliseEndpoint(input.endpoint) : (existing?.endpoint ?? null),
    destinationModule: String(input.destinationModule ?? existing?.destinationModule ?? 'arkfire.bridges'),
    credentialRefs,
    credentialStatus: Object.keys(credentialRefs).length ? 'stored-encrypted' : 'not-present',
    sourceLabels: stringArray(input.sourceLabels, existing?.sourceLabels ?? []),
    status: String(input.status ?? existing?.status ?? 'classified-not-connected'),
    importedAt: input.importedAt ?? existing?.importedAt ?? null,
  };
}

export function validateRegistry(input) {
  assertPlainObject(input, 'registry');
  if (input.schemaVersion !== REGISTRY_SCHEMA) throw new TypeError(`Unsupported registry schema: ${input.schemaVersion ?? 'missing'}`);
  if (!Array.isArray(input.providers)) throw new TypeError('registry.providers must be an array');

  const seen = new Set();
  const providers = input.providers.map((provider) => {
    const normalised = normaliseProvider(provider);
    if (seen.has(normalised.providerId)) throw new TypeError(`Duplicate providerId: ${normalised.providerId}`);
    seen.add(normalised.providerId);
    return normalised;
  });

  const integrationSeen = new Set();
  const integrationCandidates = (Array.isArray(input.integrationCandidates) ? input.integrationCandidates : []).map((integration) => {
    const normalised = normaliseIntegrationCandidate(integration);
    if (integrationSeen.has(normalised.integrationId)) throw new TypeError(`Duplicate integrationId: ${normalised.integrationId}`);
    integrationSeen.add(normalised.integrationId);
    return normalised;
  });

  return {
    schemaVersion: REGISTRY_SCHEMA,
    registryId: String(input.registryId || 'arkfire.models.local'),
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
    providers,
    integrationCandidates,
  };
}

export class RegistryStore {
  constructor(dataDirectory = null) {
    this.dataDirectory = resolveDataDirectory(dataDirectory);
    this.registryPath = join(this.dataDirectory, 'registry.json');
    this.receiptsPath = join(this.dataDirectory, 'health-receipts.jsonl');
    this._mutationQueue = Promise.resolve();
  }

  _serialise(task) {
    const operation = this._mutationQueue.then(task, task);
    this._mutationQueue = operation.catch(() => {});
    return operation;
  }

  async _initUnsafe() {
    await mkdir(this.dataDirectory, { recursive: true });
    try {
      return await this.readRegistry();
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      return this._writeRegistryUnsafe(createDefaultRegistry(), { incrementRevision: false });
    }
  }

  async init() {
    return this._serialise(() => this._initUnsafe());
  }

  async readRegistry() {
    const raw = await readFile(this.registryPath, 'utf8');
    return validateRegistry(JSON.parse(raw));
  }

  async _writeRegistryUnsafe(input, { incrementRevision = true } = {}) {
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

  async writeRegistry(input, options = {}) {
    return this._serialise(() => this._writeRegistryUnsafe(input, options));
  }

  async upsertProvider(input) {
    return this._serialise(async () => {
      const registry = await this._initUnsafe();
      const index = registry.providers.findIndex((provider) => provider.providerId === input.providerId);
      const existing = index >= 0 ? registry.providers[index] : null;
      const provider = normaliseProvider(input, existing);
      const providers = [...registry.providers];
      if (index >= 0) providers[index] = provider;
      else providers.push(provider);
      return this._writeRegistryUnsafe({ ...registry, providers });
    });
  }

  async removeProvider(providerId) {
    return this._serialise(async () => {
      const registry = await this._initUnsafe();
      const providers = registry.providers.filter((provider) => provider.providerId !== providerId);
      if (providers.length === registry.providers.length) return { registry, removed: false };
      return { registry: await this._writeRegistryUnsafe({ ...registry, providers }), removed: true };
    });
  }

  async applyProbeResults(results) {
    return this._serialise(async () => {
      const registry = await this._initUnsafe();
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
      const next = await this._writeRegistryUnsafe({ ...registry, providers });
      for (const result of results) await this._appendHealthReceiptUnsafe(result);
      return next;
    });
  }

  async _appendHealthReceiptUnsafe(result) {
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
    await mkdir(dirname(this.receiptsPath), { recursive: true });
    await appendFile(this.receiptsPath, `${JSON.stringify(receipt)}\n`, 'utf8');
    return receipt;
  }

  async appendHealthReceipt(result) {
    return this._serialise(() => this._appendHealthReceiptUnsafe(result));
  }

  async readReceipts(limit = 500) {
    try {
      const raw = await readFile(this.receiptsPath, 'utf8');
      const receipts = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      return limit === null ? receipts : receipts.slice(-Math.max(0, Number(limit) || 0));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async applyCredentialImport({ providers = [], integrations = [] } = {}) {
    return this._serialise(async () => {
      const registry = await this._initUnsafe();
      const providerMap = new Map(registry.providers.map((provider) => [provider.providerId, provider]));
      for (const input of providers) {
        const existing = providerMap.get(input.providerId) ?? null;
        providerMap.set(input.providerId, normaliseProvider(input, existing));
      }
      const integrationMap = new Map(registry.integrationCandidates.map((entry) => [entry.integrationId, entry]));
      for (const input of integrations) {
        const existing = integrationMap.get(input.integrationId) ?? null;
        integrationMap.set(input.integrationId, normaliseIntegrationCandidate(input, existing));
      }
      return this._writeRegistryUnsafe({
        ...registry,
        providers: [...providerMap.values()],
        integrationCandidates: [...integrationMap.values()],
      });
    });
  }

  async exportBundle() {
    await this._mutationQueue;
    return {
      schemaVersion: EXPORT_SCHEMA,
      exportedAt: new Date().toISOString(),
      moduleId: 'arkfire.models',
      registry: await this.readRegistry(),
      healthReceipts: await this.readReceipts(null),
      secretsIncluded: false,
    };
  }

  async importBundle(bundle) {
    assertPlainObject(bundle, 'import bundle');
    if (bundle.schemaVersion !== EXPORT_SCHEMA) throw new TypeError(`Unsupported export schema: ${bundle.schemaVersion ?? 'missing'}`);
    const imported = validateRegistry(bundle.registry);

    return this._serialise(async () => {
      const current = await this._initUnsafe();
      const providerMap = new Map(current.providers.map((provider) => [provider.providerId, provider]));
      for (const provider of imported.providers) providerMap.set(provider.providerId, provider);
      const integrationMap = new Map(current.integrationCandidates.map((entry) => [entry.integrationId, entry]));
      for (const entry of imported.integrationCandidates) integrationMap.set(entry.integrationId, entry);
      const written = await this._writeRegistryUnsafe({
        ...current,
        providers: [...providerMap.values()],
        integrationCandidates: [...integrationMap.values()],
      });

      if (Array.isArray(bundle.healthReceipts)) {
        const existing = await this.readReceipts(null);
        const byId = new Map(existing.filter((receipt) => receipt?.receiptId).map((receipt) => [receipt.receiptId, receipt]));
        for (const receipt of bundle.healthReceipts) {
          if (receipt?.schemaVersion === RECEIPT_SCHEMA && receipt.receiptId && !byId.has(receipt.receiptId)) {
            byId.set(receipt.receiptId, receipt);
          }
        }
        const lines = [...byId.values()].map((receipt) => JSON.stringify(receipt));
        if (lines.length) await writeFile(this.receiptsPath, `${lines.join('\n')}\n`, 'utf8');
      }
      return written;
    });
  }
}
