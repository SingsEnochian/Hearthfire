import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDeepArcsweepPacket } from './deep-spine-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LATEST_PATH = resolve(__dirname, 'data/deep-arcsweep.latest.json');

export async function getLatestDeepArcsweepPacket(path = process.env.DEEP_ARCSWEEP_LATEST_PATH || DEFAULT_LATEST_PATH) {
  try {
    const packet = JSON.parse(await readFile(path, 'utf8'));
    return validateDeepArcsweepPacket(packet).valid ? packet : null;
  } catch {
    return null;
  }
}

export function formatYggdrasilDeepContext(packet) {
  if (!packet) return null;
  const world = packet.worldAnchor;
  const deep = packet.deep?.values ?? {};
  const science = packet.scienceSpine ?? {};
  const ageMs = Math.max(0, Date.now() - Date.parse(packet.sampledAt));
  const ageMinutes = Math.round(ageMs / 60_000);

  return [
    '# Operational Context: DEEP × Arcsweep Science Spine',
    `Packet: ${packet.packetId}`,
    `Sampled: ${packet.sampledAt} (${ageMinutes} minutes old)`,
    `World: ${world.name} [${world.slug}]`,
    `Notion authority: ${world.notionUrl}`,
    `Arcsweep route: ${world.route ?? 'unresolved'}`,
    '',
    '## DEEP visual synthesis',
    `P=${deep.P ?? 'missing'} C=${deep.C ?? 'missing'} R=${deep.R ?? 'missing'} E=${deep.E ?? 'missing'} M=${deep.M ?? 'missing'} A=${deep.A ?? 'missing'} H=${deep.H ?? 'missing'} Q=${deep.charge ?? 'missing'}`,
    `Environment: moon=${deep.moonIllum ?? 'missing'} kp=${deep.kp ?? 'missing'} bz=${deep.bz ?? 'missing'} source=${deep.source ?? 'unspecified'}`,
    `Status: ${packet.deep?.completeness ?? 'unknown'}; register=${packet.deep?.register ?? 'unknown'}`,
    '',
    '## Science and mathematical spine',
    `PREMAQ: ${science.premaq ? 'present · PHYSICS_MODEL' : 'not supplied'}`,
    `J-space: ${science.jspace ? 'present · SPECULATIVE_MODEL' : 'not supplied'}`,
    `Fold mathematics: ${science.fold ? 'present · MATHEMATICAL_DERIVATION' : 'not supplied'}`,
    `Graph references: ${packet.graphContext?.length ?? 0}`,
    '',
    '## Yggdrasil handling law',
    '- Use this packet for routing, continuity, world structure, branch synthesis, and witnessing.',
    '- Do not turn visual synthesis into measurement.',
    '- Do not turn mathematical derivation into physical proof.',
    '- Do not overwrite source records or invent unresolved canon.',
    '- Keep worlds distinct and resolve canon through the named Notion authority.',
  ].join('\n');
}

export async function getYggdrasilDeepContextPacket() {
  return formatYggdrasilDeepContext(await getLatestDeepArcsweepPacket());
}
