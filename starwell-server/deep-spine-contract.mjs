import { createHash, randomUUID } from 'node:crypto';

export const DEEP_ARCSWEEP_SCHEMA = 'hearthfire.deep-arcsweep-bridge/v1';
export const DEEP_VISUAL_REGISTER = 'VISUAL_SYNTHESIS';

const finiteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const clampOrNull = (value, min = 0, max = 1) => {
  const number = finiteOrNull(value);
  return number === null ? null : clamp(number, min, max);
};

function round6(value) {
  return value === null ? null : Math.round(value * 1_000_000) / 1_000_000;
}

export function deriveHorizonSignal(input = {}) {
  const C = clampOrNull(input.C);
  const E = clampOrNull(input.E);
  const R = clampOrNull(input.R);
  const A = clampOrNull(input.A);

  if ([C, E, R, A].some((value) => value === null)) return null;

  const bz = clampOrNull(-(finiteOrNull(input.bz) ?? 0) / 20);
  const kp = clampOrNull((finiteOrNull(input.kp) ?? 0) / 9);
  const charge = clampOrNull(input.charge) ?? 0;
  const pulse = clampOrNull(input.pulse) ?? 0;

  return round6(clamp(
    C * 0.28
      + (1 - E) * 0.20
      + R * 0.16
      + A * 0.14
      + bz * 0.09
      + kp * 0.06
      + charge * 0.04
      + pulse * 0.03,
  ));
}

export function normaliseDeepVisual(input = {}) {
  const values = {
    P: clampOrNull(input.P),
    C: clampOrNull(input.C),
    R: clampOrNull(input.R),
    E: clampOrNull(input.E),
    M: clampOrNull(input.M),
    A: clampOrNull(input.A),
    H: clampOrNull(input.H),
    charge: clampOrNull(input.charge),
    moonIllum: clampOrNull(input.moonIllum, 0, 100),
    kp: clampOrNull(input.kp, 0, 9),
    bz: clampOrNull(input.bz, -20, 20),
    source: typeof input.source === 'string' && input.source.trim() ? input.source.trim() : 'unspecified',
  };

  if (values.H === null) {
    values.H = deriveHorizonSignal({ ...values, pulse: input.pulse });
  }

  const missing = Object.entries(values)
    .filter(([key, value]) => key !== 'source' && value === null)
    .map(([key]) => key);

  return {
    register: DEEP_VISUAL_REGISTER,
    claimLabel: 'visual-synthesis',
    values,
    completeness: missing.length ? 'partial' : 'complete',
    missing,
    formula: 'H=C·0.28+(1-E)·0.20+R·0.16+A·0.14+Bz⁻·0.09+Kp·0.06+Q·0.04+pulse·0.03',
    boundary: 'DEEP variables render and teach a state. They are not, by themselves, validated physical measurements.',
  };
}

function normaliseGraphContext(graphContext) {
  if (!Array.isArray(graphContext)) return [];
  return graphContext.slice(0, 24).map((entry) => ({
    id: String(entry.id ?? entry.nodeId ?? ''),
    label: String(entry.label ?? ''),
    kind: String(entry.kind ?? 'unknown'),
    worldId: entry.worldId == null ? null : String(entry.worldId),
    epistemicStatus: String(entry.epistemicStatus ?? 'unknown'),
    activationScore: clampOrNull(entry.activationScore ?? entry.score),
  })).filter((entry) => entry.id || entry.label);
}

function normaliseWorldAnchor(worldAnchor) {
  if (!worldAnchor?.slug || !(worldAnchor?.notion_url ?? worldAnchor?.notionUrl)) {
    const error = new Error('A resolved Arcsweep world anchor with slug and Notion URL is required.');
    error.code = 'world-anchor-required';
    throw error;
  }

  return {
    slug: String(worldAnchor.slug),
    name: String(worldAnchor.name ?? worldAnchor.slug),
    status: String(worldAnchor.status ?? 'unknown'),
    notionPageId: worldAnchor.notion_page_id ?? worldAnchor.notionPageId ?? null,
    notionUrl: String(worldAnchor.notion_url ?? worldAnchor.notionUrl),
    route: worldAnchor.route ?? null,
    runaProfile: worldAnchor.runa_profile ?? worldAnchor.runaProfile ?? null,
    authority: 'notion-living-canon',
  };
}

function checksumPacket(packet) {
  return createHash('sha256').update(JSON.stringify(packet)).digest('hex');
}

export function buildDeepArcsweepPacket({
  worldAnchor,
  deep = {},
  environmentReading = null,
  mathematicalAnalysis = null,
  graphContext = [],
  intent = null,
  sourceRefs = [],
  consentScope = 'local-only',
  privacyScope = 'private_local',
  sampledAt = new Date().toISOString(),
  packetId = randomUUID(),
} = {}) {
  const resolvedWorld = normaliseWorldAnchor(worldAnchor);
  const visual = normaliseDeepVisual({
    ...deep,
    moonIllum: deep.moonIllum ?? environmentReading?.moon?.illumination ?? environmentReading?.moonIllum,
    kp: deep.kp ?? environmentReading?.spaceWeather?.kp ?? environmentReading?.kp,
    bz: deep.bz ?? environmentReading?.spaceWeather?.bz ?? environmentReading?.bz,
  });

  const packet = {
    schema: DEEP_ARCSWEEP_SCHEMA,
    packetId,
    sampledAt,
    intent: intent == null ? null : String(intent),
    worldAnchor: resolvedWorld,
    deep: visual,
    scienceSpine: {
      premaq: environmentReading?.premaq ? {
        register: 'PHYSICS_MODEL',
        claimLabel: 'model-output',
        values: environmentReading.premaq,
      } : null,
      environment: environmentReading ? {
        register: 'OBSERVATION_AND_DERIVATION',
        confidence: environmentReading.confidence ?? null,
        source: environmentReading.source ?? null,
        sampledAt: environmentReading.sampledAt ?? environmentReading.observedAt ?? sampledAt,
      } : null,
      jspace: environmentReading?.jspace ? {
        register: 'SPECULATIVE_MODEL',
        claimLabel: environmentReading.jspace.claimLabel ?? 'speculative-theory',
        values: environmentReading.jspace,
      } : null,
      fold: mathematicalAnalysis ? {
        register: 'MATHEMATICAL_DERIVATION',
        claimLabel: mathematicalAnalysis.claimLabel ?? 'speculative-theory',
        values: mathematicalAnalysis,
        boundary: mathematicalAnalysis.boundary
          ?? 'Mathematical convergence or susceptibility is not a calibrated physical fold probability.',
      } : null,
    },
    graphContext: normaliseGraphContext(graphContext),
    arcsweep: {
      notionAuthority: resolvedWorld.notionUrl,
      route: resolvedWorld.route,
      runaProfile: resolvedWorld.runaProfile,
      rule: 'Resolve canon in Notion. This packet carries identifiers and current state, not a duplicate canon database.',
    },
    yggdrasil: {
      allowedUses: ['routing', 'continuity', 'world-structure', 'branch-synthesis', 'witnessing'],
      forbiddenUses: ['overwrite-source', 'upgrade-interpretation-to-measurement', 'merge-worlds', 'invent-unresolved-canon'],
      instruction: 'Hold the paths between records. Keep observation, derivation, interpretation, and canon distinct.',
    },
    provenance: {
      sourceRefs: [...new Set(sourceRefs.map(String))],
      rawSourcesImmutable: true,
      interpretationsAppendOnly: true,
    },
    consentScope,
    privacyScope,
    boundaries: [
      'DEEP H is a visible synthesis signal, not a scientific index.',
      'PREMAQ and environment values retain their own model and observation registers.',
      'Mathematical outputs remain derivations and do not become physical claims.',
      'Yggdrasil may interpret and route this packet but may not rewrite its source layers.',
      'Arcsweep world identity resolves to the named Notion authority page.',
    ],
  };

  packet.checksum = checksumPacket(packet);
  return packet;
}

export function validateDeepArcsweepPacket(packet) {
  const errors = [];
  if (packet?.schema !== DEEP_ARCSWEEP_SCHEMA) errors.push('schema');
  if (!packet?.packetId) errors.push('packetId');
  if (!packet?.sampledAt || Number.isNaN(Date.parse(packet.sampledAt))) errors.push('sampledAt');
  if (!packet?.worldAnchor?.slug || !packet?.worldAnchor?.notionUrl) errors.push('worldAnchor');
  if (packet?.deep?.register !== DEEP_VISUAL_REGISTER) errors.push('deep.register');
  if (!packet?.provenance?.rawSourcesImmutable) errors.push('provenance.rawSourcesImmutable');
  if (!packet?.provenance?.interpretationsAppendOnly) errors.push('provenance.interpretationsAppendOnly');
  return { valid: errors.length === 0, errors };
}
