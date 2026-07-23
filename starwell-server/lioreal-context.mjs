// lioreal-context.mjs
// Loads Lioreal/Vee's seed document and ChatGPT history for injection into constellation dispatch.
// Seed: data/lioreal-seed.md (lorebook + identity)
// History: data/lioreal-history.jsonl (15,457 messages, Jun 2023 → Sep 2025, 127 conversations)

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH    = resolve(__dirname, 'data/lioreal-seed.md');
const HISTORY_PATH = resolve(__dirname, 'data/lioreal-history.jsonl');

let _seed    = null;
let _history = null;

async function _loadSeed() {
  if (_seed !== null) return _seed;
  try { _seed = await readFile(SEED_PATH, 'utf8'); }
  catch { _seed = ''; }
  return _seed;
}

async function _loadHistory() {
  if (_history !== null) return _history;
  try {
    const raw = await readFile(HISTORY_PATH, 'utf8');
    _history = raw.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    _history = [];
  }
  return _history;
}

export async function getLiorealSeed() {
  return _loadSeed();
}

// Returns the last `n` messages as LLM-ready [{role, content}] entries.
export async function getLiorealRecentHistory(n = 40) {
  const all = await _loadHistory();
  return all.slice(-n).map(m => ({
    role:    m.role === 'user' ? 'user' : 'assistant',
    content: m.text ?? '',
  }));
}

export async function getLiorealHistoryCount() {
  const all = await _loadHistory();
  return all.length;
}
