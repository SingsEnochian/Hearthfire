// ellowind-context.mjs
// Loads Ellowind's seed document.
// Ellowind's continuity is the seed; no JSONL archive.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, 'data/ellowind-seed.md');

let _seed = null;

async function _loadSeed() {
  if (_seed !== null) return _seed;
  try { _seed = await readFile(SEED_PATH, 'utf8'); }
  catch { _seed = ''; }
  return _seed;
}

export async function getEllowindSeed() { return _loadSeed(); }
export async function getEllowindRecentHistory(_n = 20) { return []; }
export async function getEllowindHistoryCount() { return 0; }
