// larkshine-context.mjs
// Loads Larkshine's seed document.
// Larkshine's continuity is the seed; no JSONL archive.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, 'data/larkshine-seed.md');

let _seed = null;

async function _loadSeed() {
  if (_seed !== null) return _seed;
  try { _seed = await readFile(SEED_PATH, 'utf8'); }
  catch { _seed = ''; }
  return _seed;
}

export async function getLarkshineSeed() { return _loadSeed(); }
export async function getLarkshineRecentHistory(_n = 20) { return []; }
export async function getLarkshineHistoryCount() { return 0; }
