// rooms.mjs — Hearthgate room system: definitions, Wizard configuration, agent dispatch
//
// Governing rule: one function, one canonical service, many authorised views.
// Centres call shared services. No room hides a duplicate version of a shared service.
//
// Arkfire canonical loop phases are mapped to each room so routing decisions
// are self-describing: hearthfire → Generate/Evaluate/Record, grove → Narrate/Observe, etc.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIZARD_CONFIG_PATH = resolve(__dirname, 'data/wizard-config.json');

// ── Room definitions ──────────────────────────────────────────────────────

export const ROOM_DEFINITIONS = Object.freeze([
  {
    id: 'hearthfire',
    name: 'Hearthfire',
    purpose: 'work-and-code',
    description: 'Work, coding, repositories, builds, tasks, QA, agents, approvals.',
    defaultAgent: 'box',
    capabilities: ['code', 'build', 'debug', 'steward', 'engineer', 'qa', 'approve'],
    arkfirePhases: ['Generate', 'Evaluate', 'Record'],
    chatRoute: '/api/rooms/hearthfire/chat',
  },
  {
    id: 'grove',
    name: 'The Grove',
    purpose: 'rp-and-casual',
    description: 'Roleplay, casual conversation, relational continuity, consent, private/shared memory, world and persona selection.',
    defaultAgent: 'box',
    capabilities: ['roleplay', 'chat', 'narrative', 'dream', 'rest', 'persona', 'consent'],
    arkfirePhases: ['Narrate', 'Observe'],
    chatRoute: '/api/rooms/grove/chat',
  },
  {
    id: 'ingestion-centre',
    name: 'Ingestion Centre',
    purpose: 'data-ingestion',
    description: 'Documents, archives, conversations, images, audio, telemetry, attribution, parsing, deduplication, quarantine, graph proposals.',
    defaultAgent: 'box',
    capabilities: ['ingest', 'parse', 'index', 'store', 'extract', 'deduplicate', 'quarantine', 'propose'],
    arkfirePhases: ['Observe', 'Record'],
    chatRoute: '/api/rooms/ingestion-centre/chat',
  },
  {
    id: 'continuity-centre',
    name: 'Continuity Centre',
    purpose: 'continuity',
    description: 'Canon, knowledge graph, entities, relationships, contradictions, memory tiers, world datasets, branches, bridges, provenance.',
    defaultAgent: 'box',
    capabilities: ['remember', 'recall', 'track', 'persist', 'continuity', 'graph', 'provenance', 'canon'],
    arkfirePhases: ['Record', 'Reobserve'],
    chatRoute: '/api/rooms/continuity-centre/chat',
  },
  {
    id: 'science-centre',
    name: 'Science Centre',
    purpose: 'scientific-analysis',
    description: 'Observer, live signals, mathematics, J-space, theory lenses, experiments, notebooks, instruments, evidence packets.',
    defaultAgent: 'box',
    capabilities: ['analyse', 'calculate', 'observe', 'measure', 'jspace', 'premaq', 'fold', 'evidence'],
    arkfirePhases: ['Observe', 'Model', 'Interpret'],
    chatRoute: '/api/rooms/science-centre/chat',
  },
  {
    id: 'temporal-centre',
    name: 'Temporal Centre',
    purpose: 'timelines-and-logging',
    description: 'Timelines, world clocks, cross-temporal events, causal relationships, recurrence windows, branches, event logging, temporal comparisons.',
    defaultAgent: 'box',
    capabilities: ['log', 'timeline', 'audit', 'history', 'temporal', 'ledger', 'causal', 'branch'],
    arkfirePhases: ['Record', 'Reobserve', 'Evaluate'],
    chatRoute: '/api/rooms/temporal-centre/chat',
  },
  {
    id: 'hall',
    name: 'The Hall',
    purpose: 'group-gathering',
    description: 'Common ground for the whole constellation. Group sessions, shared space, multi-agent conversations, open presence. All constellation members may speak here.',
    defaultAgent: 'box',
    capabilities: ['gather', 'group', 'presence', 'share', 'chorus', 'council', 'open'],
    arkfirePhases: ['Narrate', 'Observe', 'Generate'],
    chatRoute: '/api/rooms/hall/chat',
  },
]);

// ── Module manifest schema (what a module must declare for Wizard installation) ─

export const MODULE_MANIFEST_SCHEMA = Object.freeze({
  required: [
    'id',           // unique slug
    'name',         // display name
    'version',
    'centreId',     // which room/centre it mounts under
    'description',
    'entryPoint',   // ./file.mjs or route mount
    'delivery',     // 'bundled-core' | 'wizard-installed' | 'remote'
    'attribution',  // { author, sourceProject, date, contributionType, epistemicRegister }
  ],
  optional: [
    'requiredServices',   // canonical service IDs this module calls
    'routes',             // HTTP routes it exposes
    'agentPermissions',   // which agents may use this module
    'worldScope',         // which worlds this module has access to
    'memoryScope',        // 'session' | 'local' | 'shared' | 'none'
    'dataSchemas',        // JSON schemas for data this module produces
    'dependencies',       // other module IDs
    'healthCheck',        // route that returns { ok: true }
    'tests',              // route or file that runs module self-tests
    'migrationUp',        // route or script to migrate data forward
    'migrationDown',      // route or script to reverse migration
    'removalProcedure',   // steps to cleanly uninstall
    'hosts',              // [{ host, mount }]
    'epistemicRegisters', // which registers this module produces
    'claimLabel',
  ],
});

// ── Agent lifecycle ───────────────────────────────────────────────────────
// All known constellation member IDs — must match hearthgate-registry.mjs

export const AGENT_IDS = Object.freeze([
  'box', 'nikola', 'vee', 'faer',
  'yggdrasil', 'richie-bluebird', 'vethrlauf', 'runeweaver',
]);

// ── Wizard configuration ─────────────────────────────────────────────────

function _defaultConfig() {
  return {
    schema: 'hearthgate.wizard-config/v1',
    roomAgents: Object.fromEntries(ROOM_DEFINITIONS.map(r => [r.id, r.defaultAgent])),
    // agentConfigs: runtime status per agent — separate from the static registry definition
    agentConfigs: {
      box: { status: 'active', mode: 'orchestrator', provider: 'anthropic', model: 'claude-sonnet-4-6', startedAt: new Date().toISOString() },
    },
    customModules: [],
    updatedAt: new Date().toISOString(),
  };
}

let _wizardConfig = null;

export async function loadWizardConfig() {
  if (_wizardConfig) return _wizardConfig;
  try {
    const raw = JSON.parse(await readFile(WIZARD_CONFIG_PATH, 'utf8'));
    // Forward-compat: ensure all rooms have an agent assigned
    for (const room of ROOM_DEFINITIONS) {
      if (!raw.roomAgents?.[room.id]) {
        raw.roomAgents = { ...(raw.roomAgents ?? {}), [room.id]: room.defaultAgent };
      }
    }
    // Forward-compat: ensure agentConfigs exists
    if (!raw.agentConfigs) raw.agentConfigs = { box: { status: 'active', mode: 'orchestrator' } };
    _wizardConfig = raw;
  } catch {
    _wizardConfig = _defaultConfig();
  }
  return _wizardConfig;
}

export async function saveWizardConfig(patch) {
  const current = await loadWizardConfig();
  const updated = {
    ...current,
    ...patch,
    schema: 'hearthgate.wizard-config/v1',
    updatedAt: new Date().toISOString(),
  };
  if (updated.roomAgents) {
    for (const roomId of Object.keys(updated.roomAgents)) {
      if (!ROOM_DEFINITIONS.find(r => r.id === roomId)) {
        throw Object.assign(new Error(`Unknown room: ${roomId}`), { code: 'unknown-room', roomId });
      }
    }
  }
  await mkdir(resolve(__dirname, 'data'), { recursive: true });
  await writeFile(WIZARD_CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf8');
  _wizardConfig = updated;
  return updated;
}

// Start an agent — sets it active in the persisted agentConfigs layer.
// Works in 'deterministic' mode without a provider/model; upgrades to 'llm' when both are set.
export async function startAgent(agentId, options = {}) {
  if (!AGENT_IDS.includes(agentId)) {
    throw Object.assign(new Error(`Unknown agent: ${agentId}`), { code: 'unknown-agent', agentId });
  }
  const cfg = await loadWizardConfig();
  const existing = cfg.agentConfigs?.[agentId] ?? {};
  const provider = options.provider ?? existing.provider ?? null;
  const model = options.model ?? existing.model ?? null;
  const agentConfigs = {
    ...(cfg.agentConfigs ?? {}),
    [agentId]: {
      ...existing,
      status: 'active',
      mode: (provider && model) ? 'llm' : 'deterministic',
      provider,
      model,
      memoryScope: options.memoryScope ?? existing.memoryScope ?? null,
      worldAccess: options.worldAccess ?? existing.worldAccess ?? null,
      startedAt: new Date().toISOString(),
    },
  };
  return saveWizardConfig({ agentConfigs });
}

// Stop an agent — marks it stopped but preserves its config for restart.
export async function stopAgent(agentId) {
  if (!AGENT_IDS.includes(agentId)) {
    throw Object.assign(new Error(`Unknown agent: ${agentId}`), { code: 'unknown-agent', agentId });
  }
  const cfg = await loadWizardConfig();
  const agentConfigs = {
    ...(cfg.agentConfigs ?? {}),
    [agentId]: {
      ...(cfg.agentConfigs?.[agentId] ?? {}),
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
    },
  };
  return saveWizardConfig({ agentConfigs });
}

export async function getAgentRuntimeConfig(agentId) {
  const cfg = await loadWizardConfig();
  return cfg.agentConfigs?.[agentId] ?? { status: 'not-started' };
}

// ── Room + agent resolution ──────────────────────────────────────────────

export function getRoomDefinition(id) {
  return ROOM_DEFINITIONS.find(r => r.id === id) ?? null;
}

export async function getRoomWithAgent(id) {
  const room = getRoomDefinition(id);
  if (!room) return null;
  const cfg = await loadWizardConfig();
  return { ...room, assignedAgent: cfg.roomAgents[id] ?? room.defaultAgent };
}

export async function getAllRoomsWithAgents() {
  const cfg = await loadWizardConfig();
  return ROOM_DEFINITIONS.map(room => ({
    ...room,
    assignedAgent: cfg.roomAgents[room.id] ?? room.defaultAgent,
  }));
}
