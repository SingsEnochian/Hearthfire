import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

export const CONTINUITY_PACKET_SCHEMA = 'hearthweave.continuity-packet/v0.1';

const ROUTES = Object.freeze({
  'external-observation': 'observational-continuity',
  'target-world-narrative': 'world-continuity',
  interpretation: 'interpretive-continuity',
  'system-state': 'system-continuity',
  'creative-insight': 'creative-continuity',
  'relationship-state': 'relationship-continuity',
});

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

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function fingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function readJsonLines(contents) {
  return contents
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function allItems(reviewedLamination) {
  return Object.entries(reviewedLamination.layers ?? {}).flatMap(([layer, items]) => (
    Array.isArray(items) ? items.map((item) => ({ ...item, layer: item.layer ?? layer })) : []
  ));
}

function summarizeExcluded(items) {
  return {
    candidate_count: items.filter((item) => item.status === 'candidate').length,
    held_count: items.filter((item) => item.status === 'held').length,
    rejected_count: items.filter((item) => item.status === 'rejected').length,
  };
}

function normalizeAcceptedItem(item, worldSlug) {
  assertNonEmptyString(item.item_id, 'accepted item.item_id');
  assertNonEmptyString(item.layer, 'accepted item.layer');
  assertNonEmptyString(item.text, 'accepted item.text');
  assertNonEmptyString(item.epistemic_register, 'accepted item.epistemic_register');

  const route = ROUTES[item.epistemic_register];
  if (!route) {
    throw new ContinuityExportPolicyError(
      `Unsupported accepted-item register: ${item.epistemic_register}`,
      'unsupported-continuity-register',
    );
  }

  return {
    continuity_item_id: item.item_id,
    source_item_id: item.item_id,
    world_slug: worldSlug,
    layer: item.layer,
    text: item.text.trim(),
    epistemic_register: item.epistemic_register,
    route,
    status: 'accepted',
    source_packet_ids: [...(item.source_packet_ids ?? [])],
    authority_scope: 'reviewed-continuity',
    canon_commit: false,
  };
}

export class ContinuityExportPolicyError extends Error {
  constructor(message, code = 'continuity-export-policy-violation') {
    super(message);
    this.name = 'ContinuityExportPolicyError';
    this.code = code;
  }
}

export class ContinuityExportStateError extends Error {
  constructor(message, code = 'continuity-export-state-error') {
    super(message);
    this.name = 'ContinuityExportStateError';
    this.code = code;
  }
}

export class ContinuityExporter {
  constructor({
    dataDirectory = './data',
    clock = () => new Date(),
    moduleId = 'arkfire.continuity-exporter',
  } = {}) {
    this.clock = clock;
    this.moduleId = moduleId;
    this.dataDirectory = resolve(dataDirectory);
    this.reviewedLatestPath = resolve(this.dataDirectory, 'bridge-lamination.reviewed.latest.json');
    this.packetLedgerPath = resolve(this.dataDirectory, 'bridge-continuity-packets.jsonl');
    this.packetLatestPath = resolve(this.dataDirectory, 'bridge-continuity.latest.json');
  }

  async latestReviewedLamination() {
    try {
      return JSON.parse(await readFile(this.reviewedLatestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async latest() {
    try {
      return JSON.parse(await readFile(this.packetLatestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async replay() {
    try {
      return readJsonLines(await readFile(this.packetLedgerPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async exportAccepted({
    review_id: reviewId,
    exported_by: exportedBy,
    notes = null,
  }) {
    assertNonEmptyString(reviewId, 'review_id');
    assertNonEmptyString(exportedBy, 'exported_by');

    const reviewed = await this.latestReviewedLamination();
    if (!reviewed) {
      throw new ContinuityExportStateError(
        'No reviewed lamination exists in this data directory',
        'reviewed-lamination-not-found',
      );
    }

    if (reviewed.review?.review_id !== reviewId) {
      throw new ContinuityExportStateError(
        'The reviewed layer changed after this continuity action loaded. Reload before exporting.',
        'stale-continuity-export',
      );
    }

    const items = allItems(reviewed);
    const accepted = items.filter((item) => item.status === 'accepted');
    if (accepted.length === 0) {
      throw new ContinuityExportPolicyError(
        'At least one accepted item is required before continuity can be carried forward',
        'no-accepted-continuity-items',
      );
    }

    const continuityItems = accepted.map((item) => normalizeAcceptedItem(item, reviewed.world_slug));
    const sourceFingerprint = fingerprint({
      review_id: reviewId,
      reviewed_at: reviewed.reviewed_at,
      accepted_items: continuityItems,
    });

    const existing = await this.latest();
    if (existing?.source_fingerprint === sourceFingerprint) {
      return { packet: clone(existing), created: false, idempotent: true };
    }

    const exportedAt = nowIso(this.clock);
    const packet = {
      schema: CONTINUITY_PACKET_SCHEMA,
      continuity_packet_id: randomUUID(),
      exported_at: exportedAt,
      exported_by: exportedBy.trim(),
      world_slug: reviewed.world_slug,
      session_id: reviewed.session_id,
      lamination_id: reviewed.lamination_id,
      review_id: reviewId,
      reviewer: reviewed.review?.reviewer ?? null,
      reviewed_at: reviewed.reviewed_at ?? null,
      authority: {
        state: 'human-reviewed',
        scope: 'continuity-only',
        canon_commit: false,
      },
      anchors: {
        canon_authority: reviewed.anchors?.canon_authority ?? null,
        reality_anchor: reviewed.anchors?.reality_anchor ?? null,
      },
      accepted_items: continuityItems,
      summary: {
        accepted_count: continuityItems.length,
        ...summarizeExcluded(items),
        route_counts: Object.fromEntries(
          Object.values(ROUTES).map((route) => [
            route,
            continuityItems.filter((item) => item.route === route).length,
          ]),
        ),
      },
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      source_fingerprint: sourceFingerprint,
      transport: {
        state: 'portable-local',
        adapters_applied: [],
      },
      provenance: {
        module_id: this.moduleId,
        source_schema: reviewed.schema ?? null,
        source_review_id: reviewId,
        source_lamination_id: reviewed.lamination_id,
        source_reviewed_path: this.reviewedLatestPath,
      },
    };

    await mkdir(dirname(this.packetLedgerPath), { recursive: true });
    await appendFile(this.packetLedgerPath, `${JSON.stringify(packet)}\n`, 'utf8');
    await writeFile(this.packetLatestPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');

    return { packet: clone(packet), created: true, idempotent: false };
  }

  async health() {
    const reviewed = await this.latestReviewedLamination();
    const packets = await this.replay();
    const latest = packets.at(-1) ?? null;
    return {
      ok: true,
      module: this.moduleId,
      version: '0.1.0',
      standalone: true,
      reviewed_lamination_available: Boolean(reviewed),
      latest_review_id: reviewed?.review?.review_id ?? null,
      continuity_packet_count: packets.length,
      latest_continuity_packet_id: latest?.continuity_packet_id ?? null,
      data_directory: this.dataDirectory,
      packet_ledger_path: this.packetLedgerPath,
      packet_latest_path: this.packetLatestPath,
    };
  }
}
