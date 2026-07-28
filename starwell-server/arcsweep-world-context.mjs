// arcsweep-world-context.mjs
// Loads Boxfire's thin Arcsweep lookup index.
//
// Notion is the living database and canon authority. This module deliberately
// does not copy world content into GitHub. It gives Box stable page IDs, routes,
// and Runa implementation paths so Box can resolve the real records in Notion.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = resolve(__dirname, 'data/arcsweep-world-anchors.v0.1.json');

let _index = null;
let _packet = null;

async function _loadIndex() {
  if (_index !== null) return _index;

  try {
    const raw = await readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed?.notion_registry?.url || !Array.isArray(parsed.worlds)) {
      throw new Error('Arcsweep index is missing the Notion registry or worlds array');
    }

    _index = parsed;
  } catch (error) {
    console.warn(`[Arcsweep] World-anchor index unavailable: ${error.message}`);
    _index = null;
  }

  return _index;
}

function _formatWorld(world) {
  return [
    `- ${world.name} [${world.slug}]`,
    `  Notion: ${world.notion_url ?? 'missing'}`,
    `  Page ID: ${world.notion_page_id ?? 'missing'}`,
    `  Runa: ${world.runa_profile ?? 'missing'}`,
    `  Route: ${world.route ?? 'missing'}`,
    `  Status: ${world.status ?? 'unknown'}`,
  ].join('\n');
}

export async function getArcsweepWorldAnchorIndex() {
  return _loadIndex();
}

export async function getArcsweepWorldAnchorPacket() {
  if (_packet !== null) return _packet;

  const index = await _loadIndex();
  if (!index) return null;

  const registry = index.notion_registry;
  const sourceLaw = index.source_law ?? {};
  const handoff = index.boxfire_handoff ?? {};
  const currentReality = index.shared_references?.current_reality_anchor;

  const header = [
    '# Arcsweep World Anchor Index',
    `Notion registry: ${registry.title}`,
    `Registry URL: ${registry.url}`,
    `Registry page ID: ${registry.page_id}`,
    '',
    '## Source law',
    `Notion: ${sourceLaw.notion ?? 'living database and canon authority'}`,
    `Runa: ${sourceLaw.runa ?? 'World Reception implementation'}`,
    `Hearthfire: ${sourceLaw.hearthfire ?? 'runtime adapter and identifiers only'}`,
    `Rule: ${sourceLaw.rule ?? 'Resolve Notion before changing a world record.'}`,
    '',
    '## Shared reference',
    `Current Reality Anchor: ${currentReality?.url ?? 'missing'}`,
    `Copy policy: ${currentReality?.copy_policy ?? 'reference-only'}`,
    '',
    '## Boxfire instruction',
    handoff.instruction ?? 'Use Notion as the source of truth.',
  ].join('\n');

  const worlds = index.worlds.map(_formatWorld).join('\n');
  const gates = Array.isArray(handoff.qa_gates)
    ? `\n\n## QA gates\n${handoff.qa_gates.map(gate => `- ${gate}`).join('\n')}`
    : '';

  _packet = `${header}\n\n## Registered world lookups\n${worlds}${gates}`;
  return _packet;
}
