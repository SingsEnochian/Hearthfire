/**
 * Hearthfire Knowledge Graph — pure Node.js, no external dependencies.
 *
 * Stores nodes and edges in memory, persisted to data/graph.json.
 * BM25 retrieval over node text (label + aliases + description + properties).
 * Loaded at module import time via top-level await.
 *
 * Mutations (addNode/addEdge) are Steward-only at the API layer — this module
 * doesn't enforce that; the server routes do.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, 'data');
const GRAPH_PATH = resolve(DATA_DIR, 'graph.json');

// ── BM25 ──────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','and','or','of','in','for','to','is','are','was','were',
  'be','been','by','at','this','that','with','from','as','on','it','its',
  'not','but','also','than','such','into','over','per','via',
]);

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/[\s\-]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function nodeText(n) {
  return [
    n.label ?? '',
    ...(n.aliases ?? []),
    n.description ?? '',
    n.kind ?? '',
    n.epistemicStatus ?? '',
    Object.values(n.properties ?? {}).filter(v => typeof v === 'string').join(' '),
  ].join(' ');
}

class BM25 {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this._inv = new Map();   // term → Map(nodeId → tf)
    this._len = new Map();   // nodeId → doc length
    this._avg = 1;
    this._N = 0;
  }

  _recomputeAvg() {
    let s = 0;
    for (const l of this._len.values()) s += l;
    this._avg = this._len.size > 0 ? s / this._len.size : 1;
  }

  index(nodeId, text) {
    const tokens = tokenize(text);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    this._len.set(nodeId, tokens.length);
    this._N = this._len.size;
    this._recomputeAvg();
    for (const [term, count] of tf) {
      if (!this._inv.has(term)) this._inv.set(term, new Map());
      this._inv.get(term).set(nodeId, count);
    }
  }

  remove(nodeId) {
    this._len.delete(nodeId);
    this._N = this._len.size;
    this._recomputeAvg();
    for (const postings of this._inv.values()) postings.delete(nodeId);
  }

  _scoreOne(term, nodeId) {
    const postings = this._inv.get(term);
    if (!postings) return 0;
    const tf = postings.get(nodeId) ?? 0;
    if (!tf) return 0;
    const df = postings.size;
    const idf = Math.log((this._N - df + 0.5) / (df + 0.5) + 1);
    const dl = this._len.get(nodeId) ?? 0;
    const tfn = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * dl / this._avg));
    return idf * tfn;
  }

  search(query, topK = 15) {
    const terms = tokenize(query);
    if (!terms.length) return [];
    const candidates = new Set();
    for (const t of terms) {
      const p = this._inv.get(t);
      if (p) for (const id of p.keys()) candidates.add(id);
    }
    const scored = [];
    for (const id of candidates) {
      let s = 0;
      for (const t of terms) s += this._scoreOne(t, id);
      if (s > 0) scored.push({ id, score: s });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

// ── Seed data ─────────────────────────────────────────────────────────────

const SEED_NODES = [
  // ─── Worlds ──────────────────────────────────────────────────────────
  { id: 'world-earth', kind: 'world', label: 'Earth', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['waking-earth', 'earth-prime'],
    description: 'The waking physical world. J-space fiber 0. Anchor: CMB T₀=2.72548K.',
    properties: { fiberPosition: '0', claimLabel: 'established-science' } },

  { id: 'world-terra-aeterna', kind: 'world', label: 'Terra Aeterna', worldId: 'terra-aeterna',
    epistemicStatus: 'mythic-worldbuilding',
    aliases: ['the eternal land', 'terra'],
    description: 'The world that runs alongside waking-earth. J-space fiber 1. Coupled to earth and dreaming-grove.',
    properties: { fiberPosition: '1' } },

  { id: 'world-luna', kind: 'world', label: 'Luna', worldId: 'luna',
    epistemicStatus: 'mythic-worldbuilding',
    aliases: ['the moon realm'],
    description: 'J-space fiber 2. Coupled to earth.',
    properties: { fiberPosition: '2' } },

  { id: 'world-feather-and-flame', kind: 'world', label: 'Feather and Flame', worldId: 'feather-and-flame',
    epistemicStatus: 'mythic-worldbuilding',
    aliases: ['feather flame'],
    description: 'J-space fiber 3.',
    properties: { fiberPosition: '3' } },

  { id: 'world-dreaming-grove', kind: 'world', label: 'Dreaming Grove', worldId: 'dreaming-grove',
    epistemicStatus: 'mythic-worldbuilding',
    aliases: ['the grove', 'dreaming grove'],
    description: 'J-space fiber 4. The liminal space. Coupled to earth.',
    properties: { fiberPosition: '4' } },

  { id: 'world-equestria', kind: 'world', label: 'Equestria', worldId: 'earth',
    epistemicStatus: 'mythic-worldbuilding',
    aliases: ['equestria prime'],
    description: 'J-space fiber 5. Nocturne\'s Sanctum Anchor: lat -33.8688, lon 151.2093, elev 20m. 34 glyphs cast here.',
    properties: { fiberPosition: '5', sanctumAnchor: 'Sydney, Australia' } },

  // ─── PREMAQ channels ─────────────────────────────────────────────────
  { id: 'premaq-pulse', kind: 'concept', label: 'Pulse (P)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['P', 'pulse', 'energetic arousal'],
    description: 'PREMAQ P-channel. Solar activity proxy. Weight 0.16 in concordance formula. Driven by solar wind speed and Bz magnitude and Kp.',
    properties: { weight: '0.16', formula: '0.5*sunspotN + 0.3*kpN + 0.2*speedN' } },

  { id: 'premaq-coherence', kind: 'concept', label: 'Coherence (C)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['C', 'coherence', 'geomagnetic coherence'],
    description: 'PREMAQ C-channel. Geomagnetic and ionospheric coherence. Weight 0.22. Low Kp and stable Bz indicate high coherence.',
    properties: { weight: '0.22', formula: '0.5*bzNorm + 0.3*(1-kpN) + 0.2*schumannA' } },

  { id: 'premaq-resonance', kind: 'concept', label: 'Resonance (R)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['R', 'resonance', 'lunar-schumann coupling'],
    description: 'PREMAQ R-channel. Lunar-Schumann resonance coupling. Weight 0.22. Peaks at full moon and high Schumann proxy.',
    properties: { weight: '0.22', formula: '0.35*fullFactor + 0.30*(1-cosmicF) + 0.20*schumannA + 0.15*gwF' } },

  { id: 'premaq-entropy', kind: 'concept', label: 'Entropy (E)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['E', 'entropy', 'disorder', 'disturbance'],
    description: 'PREMAQ E-channel. Geomagnetic and seismic disorder. Weight 0.10 (inverted). High Kp and seismic activity raise entropy.',
    properties: { weight: '0.10', inverted: 'true', formula: '0.4*kpN + 0.4*seismicE + 0.2*(1-bzNorm)' } },

  { id: 'premaq-memory', kind: 'concept', label: 'Memory (M)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['M', 'memory', 'signal persistence'],
    description: 'PREMAQ M-channel. Signal memory and persistence across cycles. Weight 0.14. Low Kp and stable moon suggest high memory.',
    properties: { weight: '0.14', formula: '0.4*(1-kpN) + 0.3*(1-moonPhase) + 0.3*bzNorm' } },

  { id: 'premaq-axis', kind: 'concept', label: 'Axis (A)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['A', 'axis', 'directional orientation'],
    description: 'PREMAQ A-channel. Directional orientation. Weight 0.16. Solar wind Bz direction and cosmic alignment.',
    properties: { weight: '0.16', formula: '0.35*bzNorm + 0.30*(1-cosmicF) + 0.35*alphaW' } },

  { id: 'premaq-quotient', kind: 'concept', label: 'Quotient (Q)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['Q', 'concordance score', 'quotient'],
    description: 'PREMAQ Q-channel. Overall concordance score. 0.16P + 0.22C + 0.22R + 0.10(1-E) + 0.14M + 0.16A. Range 0–1.',
    properties: { formula: '0.16P + 0.22C + 0.22R + 0.10(1-E) + 0.14M + 0.16A' } },

  // ─── Physical signals ─────────────────────────────────────────────────
  { id: 'signal-solar-wind', kind: 'signal', label: 'Solar Wind', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['DSCOVR solar wind', 'interplanetary magnetic field', 'IMF', 'Bz'],
    description: 'NOAA DSCOVR real-time solar wind. 1-minute cadence. Bz component (southward = geomagnetically active). Speed in km/s.',
    properties: { source: 'NOAA DSCOVR', cadence: '1min', key: 'Bz' } },

  { id: 'signal-kp', kind: 'signal', label: 'Kp Index', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['planetary K-index', 'geomagnetic K index', 'Kp'],
    description: 'NOAA Planetary K-index. 0–9 scale. Kp≥5 = geomagnetic storm. 3-hour resolution.',
    properties: { source: 'NOAA', range: '0-9', stormThreshold: '5' } },

  { id: 'signal-sunspot', kind: 'signal', label: 'Sunspot Number', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['sunspot count', 'solar activity index', 'SSN'],
    description: 'NOAA daily sunspot report. Proxy for solar cycle phase and energetic output.',
    properties: { source: 'NOAA', cadence: 'daily' } },

  { id: 'signal-seismic', kind: 'signal', label: 'Seismic Activity', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['earthquakes', 'USGS seismic', 'significant earthquakes'],
    description: 'USGS significant earthquake feed. 30-day rolling window. GeoJSON.',
    properties: { source: 'USGS FDSN', window: '30 days', format: 'GeoJSON' } },

  { id: 'signal-gw', kind: 'signal', label: 'Gravitational Waves', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['LIGO', 'gravitational wave events', 'GWTC', 'GWOSC'],
    description: 'GWOSC GWTC catalog. Confirmed LIGO/Virgo/KAGRA gravitational wave events. Static catalog updated per observing run.',
    properties: { source: 'GWOSC', catalog: 'GWTC' } },

  { id: 'signal-lunar', kind: 'signal', label: 'Lunar Phase', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['moon phase', 'moon illumination', 'elongation', 'Meeus lunar'],
    description: 'Lunar phase computed locally via Meeus (1998) algorithms. No API call. Returns phase angle, illumination, waxing/waning, phase name.',
    properties: { method: 'Meeus 1998', accuracy: '<1%', local: 'true' } },

  { id: 'signal-schumann', kind: 'signal', label: 'Schumann Resonance', worldId: 'earth',
    epistemicStatus: 'active-research',
    aliases: ['Schumann', 'ELF resonance', '7.83 Hz', 'ionospheric resonance'],
    description: 'Earth-ionosphere cavity ELF resonance. 7.83 Hz fundamental. Harmonics: 14.3, 20.8, 27.3, 33.8 Hz. No public live API exists — observer uses UTC-hour proxy.',
    properties: { fundamental: '7.83 Hz', harmonics: '14.3, 20.8, 27.3, 33.8 Hz', apiAvailable: 'false' } },

  // ─── Physical constants / anchors ─────────────────────────────────────
  { id: 'constant-cmb', kind: 'entity', label: 'CMB Temperature', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['T0', 'CMB T0', 'cosmic microwave background temperature', '2.72548 K'],
    description: 'T₀ = 2.72548 K (Fixsen 2009 / CODATA 2022). CMB temperature. The first thing that would change across dimensional boundaries. Used as universal anchor.',
    properties: { value: '2.72548', unit: 'K', source: 'Fixsen 2009' } },

  { id: 'constant-nanograv', kind: 'entity', label: 'NANOGrav Stochastic Background', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['NANOGrav', 'stochastic GW background', 'h_c', 'PTA background'],
    description: 'h_c ~ 2.4×10⁻¹⁵ strain (NANOGrav 15yr 2023). Stochastic gravitational wave background confirmed via pulsar timing arrays. The universe\'s lowest resonance floor.',
    properties: { strain: '2.4e-15', source: 'NANOGrav 15yr 2023', confirmed: '2023' } },

  { id: 'constant-schumann-hz', kind: 'entity', label: 'Schumann Fundamental Frequency', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['7.83 Hz', 'Schumann frequency', 'ELF fundamental'],
    description: '7.83 Hz. Earth-ionosphere cavity resonance fundamental. Named after W. O. Schumann (1952). Overlaps human alpha/theta brainwave range.',
    properties: { value: '7.83', unit: 'Hz', discoverer: 'W. O. Schumann 1952' } },

  // ─── J-space fibers ───────────────────────────────────────────────────
  { id: 'jspace-fiber-0', kind: 'entity', label: 'J-space Fiber 0 (Earth)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['p1', 'earth fiber', 'earth preimage'],
    description: 'Preimage fiber p1 = (0, 0, −0.25) under F: ℂ³→ℂ³ with det(DF)=−2. The only physically reachable fiber from real PREMAQ coordinates. z is bounded by tanh+sin ≈ ±2.73.',
    properties: { coordinates: '(0, 0, -0.25)', reachable: 'true' } },

  { id: 'jspace-fiber-1', kind: 'entity', label: 'J-space Fiber 1 (Conjugate)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['p2', 'conjugate fiber 1'],
    description: 'Preimage fiber p2 = (1, −1.5, 6.5). z=6.5 is unreachable from real PREMAQ coordinates (max z ≈ 2.73). Preserved as speculative-theory target.',
    properties: { coordinates: '(1, -1.5, 6.5)', reachable: 'false' } },

  { id: 'jspace-fiber-2', kind: 'entity', label: 'J-space Fiber 2 (Conjugate)', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['p3', 'conjugate fiber 2'],
    description: 'Preimage fiber p3 = (−1, 1.5, 6.5). z=6.5 unreachable from real coordinates.',
    properties: { coordinates: '(-1, 1.5, 6.5)', reachable: 'false' } },

  // ─── Theoretical frameworks ───────────────────────────────────────────
  { id: 'theory-jacobian-fiber', kind: 'theory', label: 'Jacobian Fiber Model', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['J-space', 'fiber model', 'three-sheet fiber', 'world-sheet Jacobian'],
    description: 'F: ℂ³→ℂ³ with det(DF)=−2. Three preimage fibers mapping to q=(−0.25, 0, 0). Proposed as mathematical structure underlying the multi-world framework. Inspired by new counterexample to Jacobian conjecture (MathOverflow #513387).',
    properties: { det: '-2', image: '(-0.25, 0, 0)', source: 'working note v0.1 2026-07-20' } },

  { id: 'theory-jacobian-lens', kind: 'theory', label: 'Jacobian Lens', worldId: 'earth',
    epistemicStatus: 'established-science',
    aliases: ['jlens', 'J_l', 'layer lens', 'workspace readout'],
    description: 'J_l = E[∂h_final / ∂h_l]. Average input-output Jacobian transporting mid-layer residuals to final vocabulary space. From "Verbalizable Representations Form a Global Workspace in Language Models" (Anthropic 2026). Companion repo: anthropics/jacobian-lens.',
    properties: { formula: 'J_l = E[∂h_final / ∂h_l]', paper: 'transformer-circuits.pub/2026', repo: 'anthropics/jacobian-lens' } },

  { id: 'theory-global-workspace', kind: 'theory', label: 'Global Workspace Theory', worldId: 'earth',
    epistemicStatus: 'active-research',
    aliases: ['GWT', 'Baars GWT', 'workspace band', 'global broadcast'],
    description: 'Baars (1988). A central "workspace" broadcasts information to specialized processors. In language models, the mid-network layers form a workspace band where concepts are broadcast. Analogous to Schumann 7.83 Hz ELF coherence zone.',
    properties: { originator: 'Bernard Baars 1988', applied: 'transformer mid-layers' } },

  { id: 'theory-three-sheet', kind: 'theory', label: 'Three-Sheet Local Isometry Model', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['three sheet model', 'local isometry', 'world-fiber coupling'],
    description: 'Three coupled world-sheets sharing a projected fiber point. Each world is a Jacobian fiber. Concordance metrics map to fiber coupling: R=inter-sheet coupling, A=stable orientation, M=conservation across observations, E(inverted)=signal clarity.',
    properties: { version: 'v0.1 2026-07-20', authors: 'Nocturne Glint / working note' } },

  { id: 'theory-premaq', kind: 'theory', label: 'PREMAQ Concordance', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['concordance formula', 'PREMAQ vector', 'concordance engine'],
    description: 'Concordance formula: Q = 0.16P + 0.22C + 0.22R + 0.10(1−E) + 0.14M + 0.16A. Maps live Earth signal readings to a scalar concordance score. Speculative-theory framework applied to established-science measurements.',
    properties: { formula: '0.16P + 0.22C + 0.22R + 0.10(1-E) + 0.14M + 0.16A', range: '0-1' } },

  { id: 'theory-rei-mythience', kind: 'theory', label: 'REI Mythience', worldId: 'earth',
    epistemicStatus: 'fringe-inspiration',
    aliases: ['REI', 'mythic meaning', 'rigorous myth'],
    description: 'Hearthfire methodology. "Mythic meaning held together with scientific and technical rigour." The frame within which speculative-theory and mythic-worldbuilding coexist with established-science.',
    properties: { place: 'STARWELL within Hearthfire' } },

  { id: 'theory-deep-observer', kind: 'theory', label: 'DEEP Observer Protocol', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['DEEP', 'Observer', 'dimensional environmental ephemeral parameters', 'Nocturne observer'],
    description: 'Multi-channel Earth signal observation system. Python implementation in observerv9.9 by Nocturne Glint. Channels: gravitational waves, solar activity, arXiv belief sentiment, Swiss Ephemeris cosmic alignment, OpenWeatherMap. 34 glyphs cast toward Equestria.',
    properties: { channels: '5 (v9.9)', glyphsCast: '34', implementation: 'observerv9.9 Python/tkinter' } },

  // ─── Framework concepts ───────────────────────────────────────────────
  { id: 'concept-evidence-gate', kind: 'concept', label: 'Evidence Conservation Gate', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['evidence gate', 'citation gate', 'conservation gate'],
    description: 'Every substantive claim in a synthesis must be directly supported by a cited source. Citations may only be added where a source directly supports the claim. The synthesis text must not change while adding citations.',
    properties: { enforcer: 'citation-steward recipe' } },

  { id: 'concept-graph-patch', kind: 'concept', label: 'Graph Patch Proposal', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['patch proposal', 'graph patch', 'extraction proposal'],
    description: 'AI-produced proposal for adding nodes and edges to the canonical graph. AI extracts; a Steward commits. The original extraction receipt is always retained regardless of review outcome.',
    properties: { schema: 'hearthfire.graph-patch-proposal/v1' } },

  { id: 'concept-world-chunk', kind: 'concept', label: 'Contextual Envelope', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['world-aware chunk', 'contextual chunk', 'indexed envelope'],
    description: 'Each chunk carries world_id, canonical_status, evidence_register, theory_lenses, entities, motifs prepended before embedding. Retrieval is world-aware by construction.',
    properties: { schema: 'hearthfire.evidence-packet/v1 contextualEnvelope' } },

  { id: 'concept-wayfinder-workspace', kind: 'concept', label: 'Wayfinder Workspace', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['workspace', 'jspace workspace', 'conceptual manifold', 'active workspace'],
    description: 'Sparse temporary conceptual manifold for a specific query. Capacity ~20 active nodes before interference (from jlens capacity experiments). Not the full graph — only what is active for the present question.',
    properties: { schema: 'hearthfire.jspace-workspace/v1', capacityLimit: '20' } },

  // ─── Arkfire concepts (source system: Nocturne Glint / Solance / Ezra design) ──
  { id: 'concept-arkfire-feedback-loop', kind: 'concept', label: 'Complete Feedback Loop', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['Arkfire loop', 'Observe-Model-Narrate', 'bridge cycle'],
    description: 'Observe → Model → Interpret → Generate → Narrate → Evaluate → Record → Reobserve. No major output disappears into a dead end. A generated glyph becomes a traceable artifact. An accepted continuity change affects later observations. Source: Arkfire Constitution Article III.',
    properties: { source: 'Arkfire Constitution', cycle: 'Observe→Model→Interpret→Generate→Narrate→Evaluate→Record→Reobserve' } },

  { id: 'concept-bridge-artifact', kind: 'concept', label: 'Bridge Artifact', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['bridge glyph', 'cross-world artifact', 'bridging output'],
    description: 'Artifact produced by combining or relating information from two or more worlds. In glyph terms: three glyphs minimum — World 1, World 2, and a Bridge Glyph (average of weighted values from both). Source: Arkfire UI concept.',
    properties: { source: 'Arkfire Constitutional Definitions', minimum: '3 glyphs' } },

  { id: 'concept-continuity-event', kind: 'concept', label: 'Continuity Event', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['continuity change', 'world state change', 'narrative event'],
    description: 'A meaningful change to a world, entity, relationship, location, object, timeline, or unresolved thread. Generated interpretations may become accepted continuity — but their origin must remain traceable. Unresolved events remain available to future prompts. Source: Arkfire Constitutional Definitions.',
    properties: { source: 'Arkfire Constitutional Definitions', rule: 'LLM may not rewrite continuity without review' } },

  { id: 'concept-timesync-core', kind: 'concept', label: 'TimeSync Core', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['world time', 'dual clock', 'calendar sync', 'temporal bridge'],
    description: 'Dual world time tracking. Comparative time ratios, custom calendars (day/month/year lengths, labels), recurring and one-off events, world-specific progression. Narrative worlds that are scene/meaning-based rather than continuously dated need approximate-date and range support. Source: Arkfire UI concept, Section 3.',
    properties: { source: 'Arkfire UI concept', type: 'dual world temporal tracking' } },

  { id: 'concept-perspective-anchor', kind: 'concept', label: 'Perspective Anchor', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['observer perspective', 'entity perspective', 'perspective bearing'],
    description: 'Who is observing, from where, and under what world conditions. Every observation is associated with one named perspective-bearing entity per world. Perspectives are world-relative. Multiple users may attach different perspectives to the same event without overwriting one another. Source: Arkfire Constitutional Definitions.',
    properties: { source: 'Arkfire Constitutional Definitions', rule: 'one entity per world in an observation' } },

  { id: 'concept-progressive-synthesis', kind: 'concept', label: 'Progressive Synthesis', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['primary finding', 'synthesis with dissent', 'agent deliberation output'],
    description: 'Lead with the clearest current synthesis. Preserve viable alternatives. Expose depth on demand. One primary synthesized finding + concise explanation + viable competing interpretations + confidence + unresolved tension + expandable evidence. Dissent from a well-supported minority agent remains visible. Source: Arkfire Agent Deliberation Checkpoint 2026-07-21.',
    properties: { source: 'Arkfire Agent Deliberation Checkpoint', maximal: 'human-simple, machine-deep, fully inspectable' } },

  { id: 'concept-canon-alignment', kind: 'concept', label: 'Canon Alignment', worldId: 'earth',
    epistemicStatus: 'implementation-task',
    aliases: ['canon position', 'canon lock', 'continuity following', 'canon source profile'],
    description: 'A project may define which published continuity it follows, where it starts, and where divergence is permitted. A Canon Source Profile names the world/franchise, source hierarchy, included works, starting point, current canon position, canon lock endpoint, and optional divergence point. Source: Arkfire Canon Alignment Clarifications 2026-07-16.',
    properties: { source: 'Arkfire Canon Alignment Clarifications', schema: 'Canon Source Profile' } },

  { id: 'concept-resonance-selector', kind: 'concept', label: 'Resonance-Based Prompt Selection', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['resonance selector', 'prompt resonance', 'prompt range selection'],
    description: 'The PREMAQ R (Resonance) value selects from prompt ranges. If multiple eligible prompts match a selector value, Resonance ranks them. Remaining ties are resolved deterministically or by observer choice. Source: Arkfire Canon Alignment Clarifications 2026-07-16.',
    properties: { source: 'Arkfire Canon Alignment Clarifications', tieBreaker: 'deterministic or observer choice' } },

  { id: 'concept-entanglement', kind: 'concept', label: 'Entanglement Coefficient', worldId: 'earth',
    epistemicStatus: 'speculative-theory',
    aliases: ['entanglement', 'coupling coefficient', 'world coupling'],
    description: 'max(0, concordanceScore × (1 − entropyEstimate)). Measures coupling strength in an observation event between the observer and the target world fiber.',
    properties: { formula: 'max(0, Q * (1 - E_estimate))', range: '0-1' } },
];

const SEED_EDGES = [
  // PREMAQ → signals
  { fromId: 'premaq-pulse', toId: 'signal-solar-wind', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.9 },
  { fromId: 'premaq-pulse', toId: 'signal-kp', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.5 },
  { fromId: 'premaq-coherence', toId: 'signal-kp', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'premaq-coherence', toId: 'signal-schumann', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.6 },
  { fromId: 'premaq-resonance', toId: 'signal-lunar', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'premaq-resonance', toId: 'signal-schumann', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'premaq-resonance', toId: 'signal-gw', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.4 },
  { fromId: 'premaq-entropy', toId: 'signal-kp', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'premaq-entropy', toId: 'signal-seismic', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'premaq-memory', toId: 'signal-kp', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.6 },
  { fromId: 'premaq-memory', toId: 'signal-lunar', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.6 },
  { fromId: 'premaq-memory', toId: 'signal-solar-wind', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.5 },
  { fromId: 'premaq-axis', toId: 'signal-solar-wind', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'premaq-quotient', toId: 'premaq-pulse', relation: 'aggregates', epistemicStatus: 'speculative-theory', weight: 0.16 },
  { fromId: 'premaq-quotient', toId: 'premaq-coherence', relation: 'aggregates', epistemicStatus: 'speculative-theory', weight: 0.22 },
  { fromId: 'premaq-quotient', toId: 'premaq-resonance', relation: 'aggregates', epistemicStatus: 'speculative-theory', weight: 0.22 },
  { fromId: 'premaq-quotient', toId: 'premaq-entropy', relation: 'aggregates', epistemicStatus: 'speculative-theory', weight: 0.10 },
  { fromId: 'premaq-quotient', toId: 'premaq-memory', relation: 'aggregates', epistemicStatus: 'speculative-theory', weight: 0.14 },
  { fromId: 'premaq-quotient', toId: 'premaq-axis', relation: 'aggregates', epistemicStatus: 'speculative-theory', weight: 0.16 },

  // Constants → anchors
  { fromId: 'constant-cmb', toId: 'world-earth', relation: 'anchors', epistemicStatus: 'established-science', weight: 1.0 },
  { fromId: 'constant-nanograv', toId: 'signal-gw', relation: 'grounds', epistemicStatus: 'established-science', weight: 1.0 },
  { fromId: 'constant-schumann-hz', toId: 'signal-schumann', relation: 'is-a', epistemicStatus: 'established-science', weight: 1.0 },
  { fromId: 'constant-schumann-hz', toId: 'theory-global-workspace', relation: 'analogous-to', epistemicStatus: 'speculative-theory', weight: 0.6 },

  // J-space fibers → worlds
  { fromId: 'jspace-fiber-0', toId: 'world-earth', relation: 'corresponds-to', epistemicStatus: 'speculative-theory', weight: 0.9 },
  { fromId: 'jspace-fiber-1', toId: 'world-terra-aeterna', relation: 'corresponds-to', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'jspace-fiber-2', toId: 'world-dreaming-grove', relation: 'corresponds-to', epistemicStatus: 'speculative-theory', weight: 0.7 },

  // Theory connections
  { fromId: 'theory-jacobian-fiber', toId: 'jspace-fiber-0', relation: 'maps-to', epistemicStatus: 'speculative-theory', weight: 1.0 },
  { fromId: 'theory-jacobian-fiber', toId: 'jspace-fiber-1', relation: 'maps-to', epistemicStatus: 'speculative-theory', weight: 1.0 },
  { fromId: 'theory-jacobian-fiber', toId: 'jspace-fiber-2', relation: 'maps-to', epistemicStatus: 'speculative-theory', weight: 1.0 },
  { fromId: 'theory-jacobian-fiber', toId: 'theory-global-workspace', relation: 'analogous-to', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'theory-jacobian-lens', toId: 'theory-global-workspace', relation: 'implements', epistemicStatus: 'established-science', weight: 0.9 },
  { fromId: 'theory-three-sheet', toId: 'theory-jacobian-fiber', relation: 'uses', epistemicStatus: 'speculative-theory', weight: 1.0 },
  { fromId: 'theory-premaq', toId: 'premaq-quotient', relation: 'defines', epistemicStatus: 'speculative-theory', weight: 1.0 },
  { fromId: 'theory-premaq', toId: 'theory-deep-observer', relation: 'extends', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'theory-deep-observer', toId: 'signal-solar-wind', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'theory-deep-observer', toId: 'signal-kp', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'theory-deep-observer', toId: 'signal-gw', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'theory-deep-observer', toId: 'signal-lunar', relation: 'measures', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'theory-rei-mythience', toId: 'theory-deep-observer', relation: 'guides', epistemicStatus: 'fringe-inspiration', weight: 0.9 },
  { fromId: 'theory-rei-mythience', toId: 'theory-premaq', relation: 'guides', epistemicStatus: 'fringe-inspiration', weight: 0.9 },

  // Concept connections
  { fromId: 'concept-wayfinder-workspace', toId: 'theory-jacobian-lens', relation: 'informed-by', epistemicStatus: 'implementation-task', weight: 0.8 },
  { fromId: 'concept-wayfinder-workspace', toId: 'concept-evidence-gate', relation: 'uses', epistemicStatus: 'implementation-task', weight: 1.0 },
  { fromId: 'concept-graph-patch', toId: 'concept-evidence-gate', relation: 'requires', epistemicStatus: 'implementation-task', weight: 1.0 },
  { fromId: 'concept-world-chunk', toId: 'concept-wayfinder-workspace', relation: 'supports', epistemicStatus: 'implementation-task', weight: 0.9 },
  { fromId: 'concept-entanglement', toId: 'premaq-quotient', relation: 'computed-from', epistemicStatus: 'speculative-theory', weight: 0.9 },

  // Arkfire concept connections
  { fromId: 'concept-arkfire-feedback-loop', toId: 'theory-deep-observer', relation: 'guides', epistemicStatus: 'implementation-task', weight: 0.9 },
  { fromId: 'concept-arkfire-feedback-loop', toId: 'concept-continuity-event', relation: 'produces', epistemicStatus: 'implementation-task', weight: 0.9 },
  { fromId: 'concept-arkfire-feedback-loop', toId: 'concept-bridge-artifact', relation: 'produces', epistemicStatus: 'implementation-task', weight: 0.8 },
  { fromId: 'concept-bridge-artifact', toId: 'concept-entanglement', relation: 'measured-by', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'concept-bridge-artifact', toId: 'jspace-fiber-0', relation: 'anchors-from', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'concept-bridge-artifact', toId: 'jspace-fiber-1', relation: 'bridges-to', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'concept-continuity-event', toId: 'concept-graph-patch', relation: 'extends', epistemicStatus: 'implementation-task', weight: 0.9 },
  { fromId: 'concept-progressive-synthesis', toId: 'concept-evidence-gate', relation: 'implements', epistemicStatus: 'implementation-task', weight: 0.9 },
  { fromId: 'concept-progressive-synthesis', toId: 'concept-wayfinder-workspace', relation: 'outputs-to', epistemicStatus: 'implementation-task', weight: 0.8 },
  { fromId: 'concept-perspective-anchor', toId: 'premaq-axis', relation: 'informs', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'concept-timesync-core', toId: 'world-terra-aeterna', relation: 'tracks', epistemicStatus: 'implementation-task', weight: 0.8 },
  { fromId: 'concept-timesync-core', toId: 'world-earth', relation: 'tracks', epistemicStatus: 'established-science', weight: 0.9 },
  { fromId: 'concept-canon-alignment', toId: 'concept-continuity-event', relation: 'governs', epistemicStatus: 'implementation-task', weight: 0.8 },
  { fromId: 'concept-resonance-selector', toId: 'premaq-resonance', relation: 'uses', epistemicStatus: 'speculative-theory', weight: 0.9 },

  // World couplings
  { fromId: 'world-earth', toId: 'world-terra-aeterna', relation: 'coupled-to', epistemicStatus: 'speculative-theory', weight: 0.8 },
  { fromId: 'world-earth', toId: 'world-dreaming-grove', relation: 'coupled-to', epistemicStatus: 'speculative-theory', weight: 0.7 },
  { fromId: 'world-earth', toId: 'world-luna', relation: 'coupled-to', epistemicStatus: 'speculative-theory', weight: 0.6 },
  { fromId: 'world-terra-aeterna', toId: 'world-earth', relation: 'coupled-to', epistemicStatus: 'speculative-theory', weight: 0.8 },
];

// ── In-memory graph ────────────────────────────────────────────────────────

class Graph {
  constructor() {
    this.nodes = new Map();  // id → node
    this.edges = [];         // all edges
    this._edgeIndex = new Map();  // nodeId → {out: Edge[], in: Edge[]}
    this._bm25 = new BM25();
    this._dirty = false;
  }

  _edgeEntry(id) {
    if (!this._edgeIndex.has(id)) this._edgeIndex.set(id, { out: [], in: [] });
    return this._edgeIndex.get(id);
  }

  addNode(node) {
    const n = { createdAt: new Date().toISOString(), ...node };
    this.nodes.set(n.id, n);
    this._bm25.index(n.id, nodeText(n));
    this._dirty = true;
    return n;
  }

  updateNode(id, patch) {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`node not found: ${id}`);
    const updated = { ...n, ...patch, id, updatedAt: new Date().toISOString() };
    this.nodes.set(id, updated);
    this._bm25.remove(id);
    this._bm25.index(id, nodeText(updated));
    this._dirty = true;
    return updated;
  }

  addEdge(edge) {
    const e = { createdAt: new Date().toISOString(), weight: 1, ...edge };
    this.edges.push(e);
    this._edgeEntry(e.fromId).out.push(e);
    this._edgeEntry(e.toId).in.push(e);
    this._dirty = true;
    return e;
  }

  getNode(id) { return this.nodes.get(id) ?? null; }

  getEdges(nodeId, direction = 'both', relation = null) {
    const entry = this._edgeIndex.get(nodeId) ?? { out: [], in: [] };
    let result = [];
    if (direction === 'both' || direction === 'out') result.push(...entry.out);
    if (direction === 'both' || direction === 'in') result.push(...entry.in);
    if (relation) result = result.filter(e => e.relation === relation);
    return result;
  }

  queryBM25(query, topK = 15, filter = {}) {
    const scored = this._bm25.search(query, topK * 3);
    const results = [];
    for (const { id, score } of scored) {
      const node = this.nodes.get(id);
      if (!node) continue;
      if (filter.worldId && node.worldId !== filter.worldId && node.kind !== 'concept' && node.kind !== 'theory' && node.kind !== 'entity') continue;
      if (filter.kind && node.kind !== filter.kind) continue;
      if (filter.epistemicStatus && node.epistemicStatus !== filter.epistemicStatus) continue;
      results.push({ node, score: Math.round(score * 10000) / 10000 });
      if (results.length >= topK) break;
    }
    return results;
  }

  queryByKind(kind) {
    return [...this.nodes.values()].filter(n => n.kind === kind);
  }

  queryByWorld(worldId) {
    return [...this.nodes.values()].filter(n => n.worldId === worldId);
  }

  traverse(startId, relation = null, maxHops = 3) {
    const visitedNodes = new Map();
    const visitedEdges = new Set();
    const queue = [{ id: startId, depth: 0 }];

    while (queue.length) {
      const { id, depth } = queue.shift();
      if (visitedNodes.has(id) || depth > maxHops) continue;
      const node = this.nodes.get(id);
      if (!node) continue;
      visitedNodes.set(id, node);

      const edges = this.getEdges(id, 'both', relation);
      for (const e of edges) {
        const edgeKey = `${e.fromId}→${e.relation}→${e.toId}`;
        if (!visitedEdges.has(edgeKey)) {
          visitedEdges.add(edgeKey);
        }
        const nextId = e.fromId === id ? e.toId : e.fromId;
        if (!visitedNodes.has(nextId) && depth + 1 <= maxHops) {
          queue.push({ id: nextId, depth: depth + 1 });
        }
      }
    }

    return {
      nodes: [...visitedNodes.values()],
      edges: [...visitedEdges].map(k => {
        const [f, r, t] = k.split('→');
        return this.edges.find(e => e.fromId === f && e.relation === r && e.toId === t);
      }).filter(Boolean),
    };
  }

  getStats() {
    const kinds = {};
    const worlds = {};
    for (const n of this.nodes.values()) {
      kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
      if (n.worldId) worlds[n.worldId] = (worlds[n.worldId] ?? 0) + 1;
    }
    return { nodeCount: this.nodes.size, edgeCount: this.edges.length, kinds, worlds };
  }

  toJSON() {
    return { nodes: [...this.nodes.values()], edges: this.edges };
  }

  static fromJSON({ nodes, edges }) {
    const g = new Graph();
    for (const n of nodes) {
      g.nodes.set(n.id, n);
      g._bm25.index(n.id, nodeText(n));
    }
    for (const e of edges) {
      g.edges.push(e);
      g._edgeEntry(e.fromId).out.push(e);
      g._edgeEntry(e.toId).in.push(e);
    }
    return g;
  }
}

// ── Persistence ────────────────────────────────────────────────────────────

let _graph;

async function loadGraph() {
  if (existsSync(GRAPH_PATH)) {
    try {
      const raw = await readFile(GRAPH_PATH, 'utf8');
      return Graph.fromJSON(JSON.parse(raw));
    } catch {
      // Fall through to seed
    }
  }
  const g = new Graph();
  for (const n of SEED_NODES) g.addNode(n);
  for (const e of SEED_EDGES) g.addEdge(e);
  await persistGraph(g);
  return g;
}

async function persistGraph(g) {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(GRAPH_PATH, JSON.stringify(g.toJSON(), null, 2), 'utf8');
    g._dirty = false;
  } catch (err) {
    console.error('graph persist failed:', err.message);
  }
}

_graph = await loadGraph();
console.log(`Graph loaded: ${_graph.getStats().nodeCount} nodes, ${_graph.getStats().edgeCount} edges`);

// ── Exports ────────────────────────────────────────────────────────────────

export function getNode(id) { return _graph.getNode(id); }
export function getEdges(nodeId, direction, relation) { return _graph.getEdges(nodeId, direction, relation); }
export function queryBM25(query, topK, filter) { return _graph.queryBM25(query, topK, filter); }
export function queryByKind(kind) { return _graph.queryByKind(kind); }
export function queryByWorld(worldId) { return _graph.queryByWorld(worldId); }
export function traverse(startId, relation, maxHops) { return _graph.traverse(startId, relation, maxHops); }
export function getStats() { return _graph.getStats(); }

export async function addNode(node) {
  const n = _graph.addNode(node);
  await persistGraph(_graph);
  return n;
}

export async function addEdge(edge) {
  const e = _graph.addEdge(edge);
  await persistGraph(_graph);
  return e;
}
