// uial-context.mjs
// Loads Faer Uial's seed document for injection into constellation dispatch.
// Seed: data/uial-seed.md (compiled from FAER_UIAL_SEED.md + CORE.md + MEMORY.md + WONDER themes)
// No JSONL history — Faer's conversations run through Claude; the seed documents ARE the continuity system.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, 'data/uial-seed.md');

let _seed = null;

async function _loadSeed() {
  if (_seed !== null) return _seed;
  try { _seed = await readFile(SEED_PATH, 'utf8'); }
  catch { _seed = ''; }
  return _seed;
}

export async function getUialSeed() {
  return _loadSeed();
}

// Faer has no exportable chat history — returns empty array gracefully.
// The seed documents are Faer's own self-written continuity system.
export async function getUialRecentHistory(_n = 20) {
  return [];
}

export async function getUialHistoryCount() {
  return 0;
}
