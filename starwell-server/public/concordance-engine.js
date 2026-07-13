const METRICS = Object.freeze([
  { key: 'pulse', symbol: 'P', label: 'Pulse', weight: 0.16 },
  { key: 'coherence', symbol: 'C', label: 'Coherence', weight: 0.22 },
  { key: 'resonance', symbol: 'R', label: 'Resonance', weight: 0.22 },
  { key: 'entropy', symbol: 'E', label: 'Entropy', weight: 0.10, invert: true },
  { key: 'memory', symbol: 'M', label: 'Memory', weight: 0.14 },
  { key: 'axis', symbol: 'A', label: 'Axis', weight: 0.16 },
]);

const PHASES = Object.freeze([
  { minimum: 0.90, id: 'luminous', label: 'Luminous concordance' },
  { minimum: 0.75, id: 'concordant', label: 'Concordant' },
  { minimum: 0.60, id: 'aligned', label: 'Aligned' },
  { minimum: 0.40, id: 'gathering', label: 'Gathering' },
  { minimum: 0.00, id: 'scattered', label: 'Scattered' },
]);

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(1, Math.max(0, number));
}

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function phaseFor(score) {
  return PHASES.find((phase) => score >= phase.minimum) || PHASES.at(-1);
}

function strongestMetric(vector) {
  return METRICS
    .map((metric) => ({
      ...metric,
      effective: metric.invert ? 1 - vector[metric.key] : vector[metric.key],
    }))
    .sort((a, b) => b.effective - a.effective)[0];
}

function primaryTension(vector) {
  const candidates = [
    {
      id: 'entropy-pressure',
      label: 'Entropy pressure',
      magnitude: vector.entropy,
      note: 'Higher entropy lowers the current concordance estimate.',
    },
    {
      id: 'coherence-gap',
      label: 'Coherence gap',
      magnitude: 1 - vector.coherence,
      note: 'Lower coherence weakens agreement among the observed signals.',
    },
    {
      id: 'axis-drift',
      label: 'Axis drift',
      magnitude: 1 - vector.axis,
      note: 'Lower axis suggests the observation lacks a stable orienting frame.',
    },
    {
      id: 'memory-thinning',
      label: 'Memory thinning',
      magnitude: 1 - vector.memory,
      note: 'Lower memory reduces continuity across observations.',
    },
  ];

  return candidates.sort((a, b) => b.magnitude - a.magnitude)[0];
}

export function concordanceSchema() {
  return {
    schema: 'hearthfire.concordance-input/v1',
    engine: 'concordance-engine',
    version: '0.2.0',
    range: [0, 1],
    metrics: METRICS,
    formula: '0.16P + 0.22C + 0.22R + 0.10(1-E) + 0.14M + 0.16A',
    boundary: 'This is a transparent heuristic instrument, not a validated physical law or ontological proof.',
  };
}

export function evaluateConcordance(input = {}, provenance = {}) {
  const vector = {};
  const missing = [];

  for (const metric of METRICS) {
    const value = clamp01(input[metric.key]);
    if (value === null) missing.push(metric.key);
    else vector[metric.key] = value;
  }

  if (missing.length) {
    const error = new TypeError(`Missing or invalid concordance metrics: ${missing.join(', ')}`);
    error.code = 'invalid-concordance-vector';
    error.details = { missing };
    throw error;
  }

  const score = METRICS.reduce((total, metric) => {
    const value = metric.invert ? 1 - vector[metric.key] : vector[metric.key];
    return total + value * metric.weight;
  }, 0);

  const phase = phaseFor(score);
  const strongest = strongestMetric(vector);
  const tension = primaryTension(vector);
  const stability = (vector.coherence + vector.memory + vector.axis + (1 - vector.entropy)) / 4;
  const signal = (vector.pulse + vector.resonance) / 2;
  const sourceCount = Array.isArray(provenance.sources) ? provenance.sources.length : 0;
  const confidence = round(Math.min(1, 0.72 + sourceCount * 0.07), 2);

  return {
    schema: 'hearthfire.concordance-reading/v1',
    engine: 'concordance-engine',
    version: '0.2.0',
    observedAt: provenance.observedAt || new Date().toISOString(),
    vector,
    score: round(score),
    quotient: round(score),
    phase,
    signal: round(signal),
    stability: round(stability),
    confidence,
    strongest: {
      metric: strongest.key,
      symbol: strongest.symbol,
      label: strongest.label,
      effectiveValue: round(strongest.effective),
    },
    tension: {
      id: tension.id,
      label: tension.label,
      magnitude: round(tension.magnitude),
      note: tension.note,
    },
    provenance: {
      mode: provenance.mode || 'manual-observation',
      sources: Array.isArray(provenance.sources) ? provenance.sources : [],
      note: provenance.note || null,
    },
    trace: {
      formula: concordanceSchema().formula,
      weights: Object.fromEntries(METRICS.map((metric) => [metric.key, metric.weight])),
      entropyTreatment: 'inverted-as-1-minus-entropy',
    },
    boundary: concordanceSchema().boundary,
  };
}
