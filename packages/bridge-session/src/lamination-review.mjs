import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const REVIEW_SCHEMA = 'hearthweave.bridge-lamination-review/v0.1';
export const REVIEWED_LAMINATION_SCHEMA = 'hearthweave.bridge-lamination-reviewed/v0.1';

const LAYERS = new Set(['changed', 'remained_true', 'became_clearer', 'gained']);
const STATUSES = new Set(['candidate', 'accepted', 'held', 'rejected']);
const ADDITION_REGISTERS = new Set([
  'target-world-narrative',
  'interpretation',
  'system-state',
  'creative-insight',
  'relationship-state',
]);

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

function summarize(layers) {
  const items = Object.values(layers).flat();
  return {
    item_count: items.length,
    accepted_count: items.filter((item) => item.status === 'accepted').length,
    candidate_count: items.filter((item) => item.status === 'candidate').length,
    held_count: items.filter((item) => item.status === 'held').length,
    rejected_count: items.filter((item) => item.status === 'rejected').length,
  };
}

function allItems(lamination) {
  return Object.entries(lamination.layers ?? {}).flatMap(([layer, items]) => (
    Array.isArray(items) ? items.map((item) => ({ ...item, layer })) : []
  ));
}

export class LaminationReviewPolicyError extends Error {
  constructor(message, code = 'lamination-review-policy-violation') {
    super(message);
    this.name = 'LaminationReviewPolicyError';
    this.code = code;
  }
}

export class LaminationReviewStateError extends Error {
  constructor(message, code = 'lamination-review-state-error') {
    super(message);
    this.name = 'LaminationReviewStateError';
    this.code = code;
  }
}

function normalizeDecision(decision, originalById) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new TypeError('decisions must contain objects');
  }
  assertNonEmptyString(decision.item_id, 'decision.item_id');
  assertNonEmptyString(decision.text, 'decision.text');
  assertNonEmptyString(decision.status, 'decision.status');

  const original = originalById.get(decision.item_id);
  if (!original) {
    throw new LaminationReviewPolicyError(
      `Unknown lamination item: ${decision.item_id}`,
      'unknown-review-item',
    );
  }
  if (!STATUSES.has(decision.status)) {
    throw new LaminationReviewPolicyError(
      `Unsupported review status: ${decision.status}`,
      'invalid-review-status',
    );
  }

  return {
    item_id: original.item_id,
    layer: original.layer,
    text: decision.text.trim(),
    previous_text: original.text,
    previous_status: original.status,
    status: decision.status,
    epistemic_register: original.epistemic_register,
    source_packet_ids: [...(original.source_packet_ids ?? [])],
  };
}

function normalizeAddition(addition) {
  if (!addition || typeof addition !== 'object' || Array.isArray(addition)) {
    throw new TypeError('additions must contain objects');
  }
  assertNonEmptyString(addition.layer, 'addition.layer');
  assertNonEmptyString(addition.text, 'addition.text');

  const status = addition.status ?? 'candidate';
  const epistemicRegister = addition.epistemic_register ?? 'creative-insight';

  if (!LAYERS.has(addition.layer)) {
    throw new LaminationReviewPolicyError(
      `Unsupported lamination layer: ${addition.layer}`,
      'invalid-review-layer',
    );
  }
  if (!STATUSES.has(status)) {
    throw new LaminationReviewPolicyError(
      `Unsupported review status: ${status}`,
      'invalid-review-status',
    );
  }
  if (!ADDITION_REGISTERS.has(epistemicRegister)) {
    throw new LaminationReviewPolicyError(
      'New review-room items cannot originate external observations. Bring external evidence through a Hearthside packet first.',
      'review-addition-external-observation',
    );
  }

  return {
    item_id: addition.item_id ?? randomUUID(),
    layer: addition.layer,
    text: addition.text.trim(),
    previous_text: null,
    previous_status: null,
    status,
    epistemic_register: epistemicRegister,
    source_packet_ids: [],
  };
}

function buildReviewedLayers(lamination, decisions, additions) {
  const decisionById = new Map(decisions.map((decision) => [decision.item_id, decision]));
  const layers = {};

  for (const layer of LAYERS) {
    const originals = Array.isArray(lamination.layers?.[layer]) ? lamination.layers[layer] : [];
    layers[layer] = originals.map((original) => {
      const decision = decisionById.get(original.item_id);
      return {
        ...clone(original),
        text: decision.text,
        status: decision.status,
      };
    });
  }

  for (const addition of additions) {
    layers[addition.layer].push({
      item_id: addition.item_id,
      layer: addition.layer,
      text: addition.text,
      epistemic_register: addition.epistemic_register,
      status: addition.status,
      source_packet_ids: [],
    });
  }

  return layers;
}

export class LaminationReviewStore {
  constructor({ dataDirectory = './data', clock = () => new Date() } = {}) {
    this.clock = clock;
    this.dataDirectory = resolve(dataDirectory);
    this.laminationLatestPath = resolve(this.dataDirectory, 'bridge-lamination.latest.json');
    this.reviewLedgerPath = resolve(this.dataDirectory, 'bridge-lamination-reviews.jsonl');
    this.reviewLatestPath = resolve(this.dataDirectory, 'bridge-lamination-review.latest.json');
    this.reviewedLatestPath = resolve(this.dataDirectory, 'bridge-lamination.reviewed.latest.json');
  }

  async latestLamination() {
    try {
      return JSON.parse(await readFile(this.laminationLatestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async latestReview() {
    try {
      return JSON.parse(await readFile(this.reviewLatestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async latestReviewedLamination() {
    try {
      return JSON.parse(await readFile(this.reviewedLatestPath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async replayReviews() {
    try {
      return (await readFile(this.reviewLedgerPath, 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async review({
    lamination_id: laminationId,
    reviewer = 'Rowan',
    decisions = [],
    additions = [],
    notes = null,
  }) {
    assertNonEmptyString(laminationId, 'lamination_id');
    assertNonEmptyString(reviewer, 'reviewer');
    if (!Array.isArray(decisions)) throw new TypeError('decisions must be an array');
    if (!Array.isArray(additions)) throw new TypeError('additions must be an array');

    const lamination = await this.latestLamination();
    if (!lamination) {
      throw new LaminationReviewStateError(
        'No durable lamination exists in this data directory',
        'lamination-not-found',
      );
    }
    if (lamination.lamination_id !== laminationId) {
      throw new LaminationReviewStateError(
        'The lamination changed after this review room loaded. Reload before laying a layer.',
        'stale-lamination-review',
      );
    }

    const originals = allItems(lamination);
    const originalById = new Map(originals.map((item) => [item.item_id, item]));
    const normalizedDecisions = decisions.map((decision) => normalizeDecision(decision, originalById));
    const decisionIds = normalizedDecisions.map((decision) => decision.item_id);

    if (new Set(decisionIds).size !== decisionIds.length) {
      throw new LaminationReviewPolicyError(
        'Each original item may be reviewed only once per receipt',
        'duplicate-review-item',
      );
    }
    if (normalizedDecisions.length !== originals.length || originals.some((item) => !decisionIds.includes(item.item_id))) {
      throw new LaminationReviewPolicyError(
        'A review receipt must include one decision for every original lamination item',
        'incomplete-lamination-review',
      );
    }

    const normalizedAdditions = additions.map(normalizeAddition);
    const reviewedLayers = buildReviewedLayers(lamination, normalizedDecisions, normalizedAdditions);
    const reviewedAt = nowIso(this.clock);

    const review = {
      schema: REVIEW_SCHEMA,
      review_id: randomUUID(),
      lamination_id: lamination.lamination_id,
      session_id: lamination.session_id,
      world_slug: lamination.world_slug,
      reviewed_at: reviewedAt,
      reviewer: reviewer.trim(),
      decisions: normalizedDecisions,
      additions: normalizedAdditions,
      summary: summarize(reviewedLayers),
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      provenance: {
        module_id: 'arkfire.lamination-review-room',
        source_lamination_schema: lamination.schema,
        source_lamination_created_at: lamination.created_at,
      },
    };

    const reviewedLamination = {
      ...clone(lamination),
      schema: REVIEWED_LAMINATION_SCHEMA,
      source_schema: lamination.schema,
      reviewed_at: reviewedAt,
      review: {
        review_id: review.review_id,
        reviewer: review.reviewer,
        notes: review.notes,
      },
      layers: reviewedLayers,
      summary: review.summary,
    };

    await mkdir(dirname(this.reviewLedgerPath), { recursive: true });
    await appendFile(this.reviewLedgerPath, `${JSON.stringify(review)}\n`, 'utf8');
    await writeFile(this.reviewLatestPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
    await writeFile(this.reviewedLatestPath, `${JSON.stringify(reviewedLamination, null, 2)}\n`, 'utf8');

    return {
      review: clone(review),
      reviewed_lamination: clone(reviewedLamination),
    };
  }

  async health() {
    const latest = await this.latestLamination();
    const reviews = await this.replayReviews();
    return {
      ok: true,
      module: 'arkfire.lamination-review-room',
      version: '0.1.0',
      standalone: true,
      lamination_available: Boolean(latest),
      latest_lamination_id: latest?.lamination_id ?? null,
      review_count: reviews.length,
      data_directory: this.dataDirectory,
      review_ledger_path: this.reviewLedgerPath,
      reviewed_latest_path: this.reviewedLatestPath,
    };
  }
}
