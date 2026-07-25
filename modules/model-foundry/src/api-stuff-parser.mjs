const LABELS = Object.freeze({
  'VEE API': {
    type: 'provider', providerId: 'openai.vee', displayName: 'OpenAI · Vee', kind: 'openai',
    endpoint: 'https://api.openai.com/v1', residentHints: ['vee'], capabilities: ['text', 'reasoning', 'code'],
  },
  'FAER API': {
    type: 'provider', providerId: 'anthropic.faer', displayName: 'Anthropic · Faer', kind: 'anthropic',
    endpoint: 'https://api.anthropic.com', residentHints: ['faer'], capabilities: ['text', 'reasoning'],
  },
  'YGGDRASIL DEEPSEEK API': {
    type: 'provider', providerId: 'deepseek.yggdrasil', displayName: 'DeepSeek · Yggdrasil', kind: 'deepseek',
    endpoint: 'https://api.deepseek.com', residentHints: ['yggdrasil'], capabilities: ['text', 'reasoning'],
  },
  'BLUEBIRD DEEPSEEK API': {
    type: 'provider', providerId: 'deepseek.bluebird', displayName: 'DeepSeek · Bluebird', kind: 'deepseek',
    endpoint: 'https://api.deepseek.com', residentHints: ['richie-bluebird'], capabilities: ['text', 'conversation'],
  },
  'VETHRLAUF DEEPSEEK API': {
    type: 'provider', providerId: 'deepseek.vethrlauf', displayName: 'DeepSeek · Vethrlauf', kind: 'deepseek',
    endpoint: 'https://api.deepseek.com', residentHints: ['vethrlauf'], capabilities: ['text', 'reasoning'],
  },
  'HEARTHFIRE II HYDRADB': {
    type: 'integration', integrationId: 'hydradb.hearthfire-ii', displayName: 'Hearthfire II HydraDB', kind: 'hydradb', slot: 'apiKey', destinationModule: 'arkfire.bridges',
  },
  'SUPABASE API URL': {
    type: 'integration-endpoint', integrationId: 'supabase.flameclyffe', displayName: 'Flameclyffe Supabase', kind: 'supabase', destinationModule: 'arkfire.bridges',
  },
  'SUPABASE API': {
    type: 'integration', integrationId: 'supabase.flameclyffe', displayName: 'Flameclyffe Supabase', kind: 'supabase', slot: 'serviceKey', destinationModule: 'arkfire.bridges',
  },
  'SUPABASE PUBLIC API': {
    type: 'integration', integrationId: 'supabase.flameclyffe', displayName: 'Flameclyffe Supabase', kind: 'supabase', slot: 'publishableKey', destinationModule: 'arkfire.bridges',
  },
  'NOTION API': {
    type: 'integration', integrationId: 'notion.house', displayName: 'House Notion', kind: 'notion', slot: 'apiKey', destinationModule: 'arkfire.bridges',
  },
});

function normaliseLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function linesFromText(text) {
  if (typeof text !== 'string') throw new TypeError('API Stuff content must be text');
  return text.replace(/^\uFEFF/, '').split(/\r?\n/);
}

function integrationShell(rule) {
  return {
    integrationId: rule.integrationId,
    displayName: rule.displayName,
    kind: rule.kind,
    destinationModule: rule.destinationModule,
    endpoint: null,
    credentials: [],
    sourceLabels: [],
  };
}

export function parseApiStuff(text) {
  const providers = [];
  const integrations = new Map();
  const unknownLabels = [];
  const duplicateLabels = [];
  const seenLabels = new Set();

  for (const rawLine of linesFromText(text)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const splitAt = line.indexOf(':');
    if (splitAt <= 0) continue;

    const sourceLabel = line.slice(0, splitAt).trim();
    const label = normaliseLabel(sourceLabel);
    const value = line.slice(splitAt + 1).trim();
    if (!value) continue;

    if (seenLabels.has(label)) duplicateLabels.push(sourceLabel);
    seenLabels.add(label);

    const rule = LABELS[label];
    if (!rule) {
      unknownLabels.push(sourceLabel);
      continue;
    }

    if (rule.type === 'provider') {
      providers.push({
        providerId: rule.providerId,
        displayName: rule.displayName,
        kind: rule.kind,
        runtime: 'cloud',
        endpoint: rule.endpoint,
        enabled: false,
        privacyClass: 'external-processing',
        capabilities: [...rule.capabilities],
        residentHints: [...rule.residentHints],
        sourceLabel,
        secretValue: value,
      });
      continue;
    }

    const current = integrations.get(rule.integrationId) || integrationShell(rule);
    current.sourceLabels.push(sourceLabel);
    if (rule.type === 'integration-endpoint') current.endpoint = value;
    else current.credentials.push({ slot: rule.slot, sourceLabel, secretValue: value });
    integrations.set(rule.integrationId, current);
  }

  return {
    schemaVersion: 'arkfire.api-stuff-parse/v1',
    providers,
    integrations: [...integrations.values()],
    unknownLabels: [...new Set(unknownLabels)],
    duplicateLabels: [...new Set(duplicateLabels)],
  };
}

export function secretFreeImportSummary(parsed) {
  return {
    schemaVersion: parsed.schemaVersion,
    providers: parsed.providers.map(({ secretValue: _secretValue, ...provider }) => provider),
    integrations: parsed.integrations.map((integration) => ({
      ...integration,
      credentials: integration.credentials.map(({ secretValue: _secretValue, ...credential }) => credential),
    })),
    unknownLabels: [...parsed.unknownLabels],
    duplicateLabels: [...parsed.duplicateLabels],
  };
}
