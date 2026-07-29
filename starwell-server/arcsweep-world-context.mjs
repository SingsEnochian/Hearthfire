// arcsweep-world-context.mjs
// Loads the thin Arcsweep lookup index used by Boxfire and bridge modules.
//
// Notion is the living database and canon authority. This module deliberately
// does not copy world content into GitHub. It gives local systems stable page
// IDs, routes, and Runa implementation paths so they can resolve the real
// records in Notion.

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

function _normaliseKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

export async function resolveArcsweepWorldAnchor(key) {
  const index = await _loadIndex();
  if (!index || key == null) return null;

  const raw = String(key).trim();
  const normalised = _normaliseKey(raw);
  return index.worlds.find((world) => {
    const candidates = [
      world.slug,
      world.name,
      world.notion_page_id,
      world.notion_url,
      world.route,
    ].filter(Boolean);
    return candidates.some((candidate) => String(candidate) === raw || _normaliseKey(candidate) === normalised);
  }) ?? null;
}

export async function getArcsweepWorldAnchorSummary(key) {
  const world = await resolveArcsweepWorldAnchor(key);
  if (!world) return null;
  return {
    slug: world.slug,
    name: world.name,
    status: world.status ?? 'unknown',
    notionPageId: world.notion_page_id ?? null,
    notionUrl: world.notion_url ?? null,
    runaProfile: world.runa_profile ?? null,
    route: world.route ?? null,
  };
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
