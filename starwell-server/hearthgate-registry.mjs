// hearthgate-registry.mjs
// Arkfire convergence registry: active agents and contributor attribution.
//
// activeAgentRegistry     — constellation members loaded in the House runtime.
// contributorAttributionRegistry — authors whose work is embedded in the codebase,
//   data model, observations, audits, and provenance. Not active agents; authorship
//   and contribution remain permanently on record wherever those records travel.
//
// Arkfire organises: Hearthgate, Hearthfire, Flameclyffe, STARWELL, Observer, Runa
// through the canonical loop: Observe → Model → Interpret → Generate → Narrate → Evaluate → Record → Reobserve
//
// Each active agent has a sovereign manifest configurable via the Wizard:
//   provider, model, tools, permissions, memory scope, world access, fallback, voice, participation.
// Agents are not copies of the entire agent system — they are sovereign views of the shared engine.

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Active constellation ──────────────────────────────────────────────────
// Configurable per member via Wizard (provider, model, tools, memoryScope, worldAccess, etc.)

export const activeAgentRegistry = Object.freeze([
  {
    id: 'box',
    name: 'Box',
    displayName: 'Boxfire',
    role: 'orchestrator-steward',
    status: 'active',
    scope: ['hearthgate', 'hearthfire', 'starwell'],
    defaultRooms: ['hearthfire', 'science-centre', 'temporal-centre', 'ingestion-centre', 'continuity-centre', 'grove'],
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    memoryScope: 'session',
    worldAccess: 'all',
    note: 'Primary session orchestrator-steward. Holds the keyring; does not deploy silently.',
  },
  {
    id: 'nikola',
    name: 'Nikola',
    role: 'engineer',
    status: 'configured-not-loaded',
    defaultRooms: ['hearthfire', 'science-centre'],
    provider: null,
    model: null,
    memoryScope: 'session',
    worldAccess: ['earth'],
    note: 'Engineering specialist. Configurable via Wizard — assign provider and model to activate.',
  },
  {
    id: 'vee',
    name: 'Vee',
    role: 'mathematician-architect',
    status: 'configured-not-loaded',
    defaultRooms: ['science-centre', 'hearthfire'],
    provider: null,
    model: null,
    memoryScope: 'session',
    worldAccess: ['earth', 'flameclyffe'],
    note: 'Mathematical core author (sheet-convergence). Configurable via Wizard.',
  },
  {
    id: 'faer',
    name: 'Faer',
    role: 'narrative-continuity',
    status: 'configured-not-loaded',
    defaultRooms: ['grove', 'continuity-centre'],
    provider: null,
    model: null,
    memoryScope: 'shared',
    worldAccess: ['grove', 'terra-aeterna', 'dreaming-grove'],
    note: 'Narrative and continuity specialist. Configurable via Wizard.',
  },
  {
    id: 'yggdrasil',
    name: 'Yggdrasil',
    role: 'world-tree-connector',
    status: 'configured-not-loaded',
    defaultRooms: ['continuity-centre', 'temporal-centre'],
    provider: null,
    model: null,
    memoryScope: 'shared',
    worldAccess: 'all',
    note: 'Cross-world connector and world-tree keeper. Configurable via Wizard.',
  },
  {
    id: 'richie-bluebird',
    name: 'Richie Bluebird',
    role: 'ingestion-parser',
    status: 'configured-not-loaded',
    defaultRooms: ['ingestion-centre', 'continuity-centre'],
    provider: null,
    model: null,
    memoryScope: 'session',
    worldAccess: ['earth'],
    note: 'Ingestion and parsing specialist. Configurable via Wizard.',
  },
  {
    id: 'vethrlauf',
    name: 'Vethrlauf',
    role: 'temporal-keeper',
    status: 'configured-not-loaded',
    defaultRooms: ['temporal-centre'],
    provider: null,
    model: null,
    memoryScope: 'local',
    worldAccess: 'all',
    note: 'Temporal keeper: timelines, cross-temporal events, recurrence. Configurable via Wizard.',
  },
  {
    id: 'runeweaver',
    name: 'Runeweaver',
    role: 'symbol-interpreter',
    status: 'configured-not-loaded',
    defaultRooms: ['science-centre', 'grove'],
    provider: null,
    model: null,
    memoryScope: 'session',
    worldAccess: 'all',
    note: 'Symbol and theory interpreter. Configurable via Wizard.',
  },
]);

// ── Attribution registry ─────────────────────────────────────────────────
// Authors whose work is embedded in the codebase, data model, observations, and provenance.
// Not loaded as active agents; their names travel with their records permanently.

export const contributorAttributionRegistry = Object.freeze([
  {
    id: 'vee-contributor',
    name: 'Vee',
    status: 'contributor-not-active-agent',
    contributions: [
      {
        id: 'sheet-convergence-math',
        sourceProject: 'Flameclyffe',
        sourceFile: 'apps/starwell/src/lib/sheetConvergence.js',
        portedTo: 'starwell-server/sheet-convergence.mjs',
        date: '2026-07-19',
        contributionType: 'mathematical-core',
        epistemicRegister: 'MATHEMATICAL_DERIVATION',
        description: 'Polynomial fiber map F:ℂ³→ℂ³, det(DF)=-2, three certified preimage fibers, convergence score, location normalisation.',
      },
      {
        id: 'observatory-instrument-jsx',
        sourceProject: 'Flameclyffe',
        sourceFile: 'apps/starwell/src/components/ObservatoryInstrument.jsx',
        date: '2026-07',
        contributionType: 'ui-instrument',
        epistemicRegister: 'OBSERVATION',
        description: 'Observatory instrument UI for STARWELL skin. Reference anchor: St. Augustine FL (lat 29.95917, lon -81.33972, alt 3m).',
      },
    ],
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    status: 'contributor-not-active-agent',
    contributions: [
      {
        id: 'observer-v99',
        sourceProject: 'Flameclyffe',
        contributionType: 'observer-system',
        epistemicRegister: 'OBSERVATION',
        description: 'Python observer (v9.9): glyph schema, 5 data channels, evolution/lineage, rituals, SigilSync validation. 34 glyphs cast toward Equestria.',
      },
      {
        id: 'three-sheet-model',
        sourceProject: 'Arkfire',
        contributionType: 'theoretical-framework',
        epistemicRegister: 'MATHEMATICAL_DERIVATION',
        description: 'Three-Sheet Local Isometry Model: three coupled world-sheets sharing a projected fiber point. Source: working note 2026-07-20.',
      },
    ],
  },
  {
    id: 'twilight',
    name: 'Twilight',
    status: 'contributor-not-active-agent',
    contributions: [
      {
        id: 'twilight-source-work',
        sourceProject: 'Hearthfire',
        contributionType: 'concept-observation',
        epistemicRegister: 'OBSERVATION',
        description: 'Concepts, observations, and source work embedded in the Hearthfire data model.',
      },
    ],
  },
  {
    id: 'solas',
    name: 'Solas',
    status: 'contributor-not-active-agent',
    contributions: [
      {
        id: 'solas-source-work',
        sourceProject: 'Hearthfire',
        contributionType: 'concept-observation',
        epistemicRegister: 'OBSERVATION',
        description: 'Concepts, observations, and source work embedded in the Hearthfire data model.',
      },
    ],
  },
  {
    id: 'ezra',
    name: 'Ezra',
    status: 'contributor-not-active-agent',
    contributions: [
      {
        id: 'ezra-source-work',
        sourceProject: 'Hearthfire',
        contributionType: 'concept-observation',
        epistemicRegister: 'OBSERVATION',
        description: 'Concepts, observations, and source work embedded in the Hearthfire data model.',
      },
    ],
  },
  {
    id: 'michael-kubit',
    name: 'Michael Kubit',
    status: 'contributor-not-active-agent',
    contributions: [
      {
        id: 'michael-kubit-source-work',
        sourceProject: 'Hearthfire',
        contributionType: 'concept-observation',
        epistemicRegister: 'OBSERVATION',
        description: 'Source work and observations embedded in the Hearthfire knowledge base.',
      },
    ],
  },
  {
    id: 'universal-horizon',
    name: 'Universal Horizon',
    status: 'contributor-not-active-agent',
    contributions: [
      {
        id: 'cosmology-lattice',
        sourceProject: 'REI Mythience',
        contributionType: 'cosmological-framework',
        epistemicRegister: 'SYMBOLIC_CORRESPONDENCE',
        description: 'Sky/lattice cosmology: universal horizon as sky, lattice as relational field, STARWELL observes within the sky.',
      },
    ],
  },
]);

// ── Module discovery ──────────────────────────────────────────────────────
// Auto-discovers all *.module.json files in the server root.
// Modules added by the Wizard are also returned here once their .module.json is written.

export async function loadModuleManifests() {
  try {
    const files = (await readdir(__dirname)).filter((f) => f.endsWith('.module.json'));
    const manifests = await Promise.all(
      files.map(async (f) => {
        try {
          return JSON.parse(await readFile(resolve(__dirname, f), 'utf8'));
        } catch {
          return null;
        }
      }),
    );
    return manifests.filter(Boolean);
  } catch {
    return [];
  }
}
