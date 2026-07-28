// box-context.mjs
// Loads Box's self-written seed document and the thin Arcsweep lookup index.
//
// Box's identity remains in data/box-seed.md. The Arcsweep packet is appended
// as a named operational block, not merged into or treated as identity.
// Notion remains the living database and canon authority.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getArcsweepWorldAnchorPacket } from './arcsweep-world-context.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, 'data/box-seed.md');

let _seed = null;

async function _loadIdentitySeed() {
  try {
    return await readFile(SEED_PATH, 'utf8');
  } catch {
    return '';
  }
}

async function _loadSeed() {
  if (_seed !== null) return _seed;

  const [identity, arcsweep] = await Promise.all([
    _loadIdentitySeed(),
    getArcsweepWorldAnchorPacket(),
  ]);

  const blocks = [identity];
  if (arcsweep) {
    blocks.push(`---\n\n# Operational Context: Arcsweep World Registry\n\n${arcsweep}`);
  }

  _seed = blocks.filter(Boolean).join('\n\n');
  return _seed;
}

export async function getBoxSeed() { return _loadSeed(); }
export async function getBoxRecentHistory(_n = 20) { return []; }
export async function getBoxHistoryCount() { return 0; }
