// arcsweep-world-context.mjs
// Loads the reviewed Arcsweep world-anchor seed for Boxfire.
//
// Notion remains the world/canon authority. Runa holds the current World
// Reception audio profiles. This loader gives Box a concise, provenance-rich
// context packet without merging either source into Box's identity seed.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, 'data/arcsweep-world-anchors.v0.1.json');

let _manifest = null;
let _packet = null;

async function _loadManifest() {
  if (_manifest !== null) return _manifest;

  try {
    const raw = await readFile(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.worlds)) {
      throw new Error('Arcsweep world-anchor manifest has no worlds array');
    }

    _manifest = parsed;
  } catch (error) {
    console.warn(`[Arcsweep] World-anchor seed unavailable: ${error.message}`);
    _manifest = null;
  }

  return _manifest;
}

function _formatWorld(world) {
  const identity = world.identity ?? {};
  const arcsweep = world.arcsweep_seed ?? {};
  const openQuestions = Array.isArray(arcsweep.open_questions)
    ? arcsweep.open_questions.join(' | ')
    : 'none recorded';

  return [
    `### ${world.name} [${world.slug}]`,
    `Status: ${world.status ?? 'unknown'}`,
    `Notion authority: ${world.notion_url ?? 'missing'}`,
    `Runa reception profile: ${world.runa_profile ?? 'missing'}`,
    `Route: ${world.route ?? 'missing'}`,
    `Tone: ${identity.tone ?? 'unresolved'}`,
    `Shape: ${identity.shape ?? 'unresolved'}`,
    `Arrival: ${identity.arrival_signature ?? 'unresolved'}`,
    `Return: ${identity.return_signature ?? 'unresolved'}`,
    `Companion rule: ${arcsweep.companion_interface?.notes ?? 'unresolved; do not infer'}`,
    `Open questions: ${openQuestions}`,
  ].join('\n');
}

export async function getArcsweepWorldAnchorManifest() {
  return _loadManifest();
}

export async function getArcsweepWorldAnchorPacket() {
  if (_packet !== null) return _packet;

  const manifest = await _loadManifest();
  if (!manifest) return null;

  const authority = manifest.authority ?? {};
  const returnContract = manifest.shared_inheritance?.return_contract ?? {};
  const handoff = manifest.boxfire_handoff ?? {};

  const header = [
    '# Arcsweep World Anchor Seed',
    `Manifest: ${manifest.id ?? 'unknown'} v${manifest.version ?? 'unknown'}`,
    `Authority: ${authority.primary ?? 'Notion authority not recorded'}`,
    `Technical profiles: ${authority.technical_profiles ?? 'Runa profile authority not recorded'}`,
    `Ingest law: ${authority.ingest_rule ?? 'Preserve provenance and do not rewrite canon silently.'}`,
    '',
    '## Shared return contract',
    `Automatic start allowed: ${returnContract.automatic_start_allowed === true ? 'yes' : 'no'}`,
    `Feather / Icarus: ${returnContract.feather_or_icarus ?? 'pause and request consent'}`,
    `Stop & Close: ${returnContract.stop_and_close ?? 'stop and close every active layer'}`,
    `Notch: ${returnContract.notch ?? 'restore orientation'}`,
    `Plain pass: ${returnContract.plain_pass ?? 'remove mythic framing only'}`,
    '',
    '## Boxfire instruction',
    handoff.instruction ?? 'Verify source authority before changing any world record.',
  ].join('\n');

  const worlds = manifest.worlds.map(_formatWorld).join('\n\n');
  const gates = Array.isArray(handoff.qa_gates)
    ? `\n\n## QA gates\n${handoff.qa_gates.map(gate => `- ${gate}`).join('\n')}`
    : '';

  _packet = `${header}\n\n## Registered worlds\n${worlds}${gates}`;
  return _packet;
}
