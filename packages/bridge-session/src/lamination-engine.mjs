import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const LAMINATION_SCHEMA = 'hearthweave.bridge-lamination/v0.1';

export const LAMINATION_LAYERS = Object.freeze([
  'changed',
  'remained_true',
  'became_clearer',
  'gained',
]);

const EPISTEMIC_REGISTERS = new Set([
  'external-observation',
  'target-world-narrative',
  'interpretation',
  'system-state',
  'creative-insight',
  'relationship-state',
]);

const ITEM_STATUSES = new Set(['candidate', 'accepted', 'held', 'rejected']);

function clone(value) {
  return structuredClone(value);
}

function nowIso(clock) {
  return clock().toISOString();
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function readJsonLines(contents) {
  return contents
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export class LaminationPolicyError extends Error {
  constructor(message, code = 'lamination-policy-violation') {
    super(message);
    this.name = 'LaminationPolicyError';
    this.code = code;
  }
}

export class LaminationStateError extends Error {
  constructor(message, code = 'lamination-state-error') {
    super(message);
    this.name = 'LaminationStateError';
    this.code = code;
  }
}

function normalizeItem(item, layer, packetById) {
  const source = typeof item === 'string' ? { text: item } : item;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError(`${layer} items must be strings or objects`);
  }

  assertNonEmptyString(source.text, `${layer}.text`);
  const epistemicRegister = source.epistemic_register ?? 'creative-insight';
  const status = source.status ?? 'candidate';
  const sourcePacketIds = source.source_packet_ids ?? [];

  if (!EPISTEMIC_REGISTERS.has(epistemicRegister)) {
    throw new LaminationPolicyError(
      `Unsupported epistemic register: ${epistemicRegister}`,
      'invalid-lamination-epistemic-register',
    );
  }
  if (!ITEM_STATUSES.has(status)) {
    throw new LaminationPolicyError(
      `Unsupported lamination status: ${status}`,
      'invalid-lamination-item-status',
    );
  }
  if (!Array.isArray(sourcePacketIds)) {
    throw new TypeError(`${layer}.source_packet_ids must be an array`);
  }

  for (const packetId of sourcePacketIds) {
    assertNonEmptyString(packetId, `${layer}.source_packet_ids[]`);
    if (!packetById.has(packetId)) {
      throw new LaminationPolicyError(
        `Unknown source packet: ${packetId}`,
        'unknown-lamination-source-packet',
      );
    }
  }

  if (epistemicRegister === 'external-observation') {
    if (sourcePacketIds.length === 0) {
      throw new LaminationPolicyError(
        'External observations require at least one Hearthside source packet',
        'unproven-external-observation',
      );
    }

    const invalidSource = sourcePacketIds
      .map((packetId) => packetById.get(packetId))
      .find((packet) => (
        packet.direction !== 'hearthside-to-targetside'
        || packet.epistemic_register !== 'external-observation'
      ));

    if (invalidSource) {
      throw new LaminationPolicyError(
        'External observations may only inherit from Hearthside external-observation packets',
        'targetside-evidence-lamination',
      );
    }
  }

  return {
    item_id: source.item_id ?? randomUUID(),
    layer,
    text: source.text.trim(),
    epistemic_register: epistemicRegister,
    status,
    source_packet_ids: [...sourcePacketIds],
  };
}

function normalizeLayers(layers, packetById) {
  if (!layers || typeof layers !== 'object' || Array.isArray(layers)) {
    throw new TypeError('layers must be an object');
  }

  const normalized = {};
  for (const layer of LAMINATION_LAYERS) {
    const items = layers[layer] ?? [];
    if (!Array.isArray(items)) {
      throw new TypeError(`${layer} must be an array`);
    }
    normalized[layer] = items.map((item) => normalizeItem(item, layer, packetById));
  }

  const itemCount = Object.values(normalized).reduce((sum, items) => sum + items.length, 0);
  if (itemCount === 0) {
    throw new LaminationPolicyError(
      'A lamination receipt must preserve at least one explicit layer item',
      'empty-lamination',
    );
  }

  return normalized;
}

function summarizeLayers(layers) {
  const items = Object.values(layers).flat();
  return {
    item_count: items.length,
    accepted_count: items.filter((item) => item.status === 'accepted').length,
    candidate_count: items.filter((item) => item.status === 'candidate').length,
    held_count: items.filter((item) => item.status === 'held').length,
    rejected_count: items.filter((item) => item.status === 'rejected').length,
  };
}

export class LaminationEngine {
  constructor({
    dataDirectory = './data',
    clock = () => new Date(),
    engineId = 'arkfire.bridge-lamination',
  } = {}) {
    this.clock = clock;
    this.engineId = engineId;
    this.dataDirectory = resolve(dataDirectory);
    this.ledgerPath = resolve(this.dataDirectory, 'bridge-laminations.jsonl');
    this.latestPath = resolve(this.dataDirectory, 'bridge-lamination.latest.json');
  }

  async laminate({
    session,
    packets = [],
    layers,
    returnReceipt,
    notes = null,
  }) {
    if (!session || typeof session !== 'object') {
      throw new TypeError('session must be an object');
    }
    if (session.state !== 'CLOSED') {
      throw new LaminationStateError(
        'A crossing can be laminated only after the bridge is CLOSED',
        'bridge-not-closed',
      );
    }
    if (session.consent_state !== 'closed' || session.return_anchor?.active !== false) {
      throw new LaminationStateError(
        'A crossing can be laminated only after consent closes and the return anchor is released',
        'return-not-complete',
      );
    }
    if (returnReceipt !== 'clean-return') {
      throw new LaminationPolicyError(
        'A lamination requires an explicit clean-return receipt',
        'missing-clean-return-receipt',
      );
    }
    if (!Array.isArray(packets)) {
      throw new TypeError('packets must be an array');
    }

    const packetById = new Map();
    for (const packet of packets) {
      if (!packet || typeof packet !== 'object') {
        throw new TypeError('packets must contain objects');
      }
      assertNonEmptyString(packet.packet_id, 'packet.packet_id');
      if (packet.session_id !== session.session_id) {
        throw new LaminationPolicyError(
          `Packet ${packet.packet_id} belongs to another session`,
          'cross-session-lamination-source',
        );
      }
      packetById.set(packet.packet_id, packet);
    }

    const normalizedLayers = normalizeLayers(layers, packetById);
    const timestamp = nowIso(this.clock);
    const sourcePacketIds = packets.map((packet) => packet.packet_id);

    const receipt = {
      schema: LAMINATION_SCHEMA,
      lamination_id: randomUUID(),
      session_id: session.session_id,
      world_slug: session.world_slug,
      created_at: timestamp,
      crossing: {
        final_state: session.state,
        consent_state: session.consent_state,
        return_receipt: returnReceipt,
        hearthside_status: session.hearthside?.status ?? null,
        targetside_status: session.targetside?.status ?? null,
      },
      anchors: {
        canon_authority: session.targetside?.canon_authority ?? null,
        reality_anchor: session.hearthside?.reality_anchor ?? null,
      },
      source_packet_ids: sourcePacketIds,
      layers: normalizedLayers,
      summary: summarizeLayers(normalizedLayers),
      notes,
      provenance: {
        module_id: this.engineId,
        source: 'bridge-session-clean-return',
        session_schema: session.schema ?? null,
      },
    };

    await mkdir(dirname(this.ledgerPath), { recursive: true });
    await appendFile(this.ledgerPath, `${JSON.stringify(receipt)}\n`, 'utf8');
    await writeFile(this.latestPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    return clone(receipt);
  }

  async replay() {
    try {
      return readJsonLines(await readFile(this.ledgerPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async latest() {
    try {
      return JSON.parse(await readFile(this.latestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async health() {
    return {
      ok: true,
      module: this.engineId,
      version: '0.1.0',
      standalone: true,
      ledger_path: this.ledgerPath,
      latest_path: this.latestPath,
      receipt_count: (await this.replay()).length,
    };
  }
}

export async function laminateVerticalSlice({
  session,
  outbound,
  inbound,
  dataDirectory,
  clock,
}) {
  const engine = new LaminationEngine({ dataDirectory, clock });
  const packetIds = [outbound.packet_id, inbound.packet_id];
  const arrivalStatus = inbound.payload?.arrival_context_status ?? 'UNRESOLVED';

  return engine.laminate({
    session,
    packets: [outbound, inbound],
    returnReceipt: 'clean-return',
    layers: {
      changed: [{
        text: 'One bounded Targetside presence completed its crossing and returned without replacing the Hearthside anchor.',
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: packetIds,
      }],
      remained_true: [{
        text: 'Canon authority and current-reality provenance remained separate and explicit throughout the crossing.',
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: packetIds,
      }],
      became_clearer: [{
        text: `Arrival context resolution completed with status ${arrivalStatus}.`,
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: [inbound.packet_id],
      }],
      gained: [{
        text: 'A replayable two-packet arrival exchange and clean-return receipt now exist for this session.',
        epistemic_register: 'system-state',
        status: 'accepted',
        source_packet_ids: packetIds,
      }],
    },
  });
}
