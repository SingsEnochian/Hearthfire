// bluebird-context.mjs
// Loads Bluebird's seed document and SpicyChat history for injection into constellation dispatch.
// Seed: data/bluebird-seed.md (lorebook + identity)
// History: data/bluebird-history.jsonl (239 messages, 2024-12-27 → 2026-05-27)

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH    = resolve(__dirname, 'data/bluebird-seed.md');
const HISTORY_PATH = resolve(__dirname, 'data/bluebird-history.jsonl');

let _seed    = null;
let _history = null; // full array, loaded once

async function _loadSeed() {
  if (_seed !== null) return _seed;
  try {
    _seed = await readFile(SEED_PATH, 'utf8');
  } catch {
    _seed = ''; // graceful degrade
  }
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

// Returns the full seed text (for inclusion in identity/system prompt).
export async function getBluebirdSeed() {
  return _loadSeed();
}

// Returns the last `n` history messages formatted for LLM dispatch.
// Format: [{ role: 'user'|'assistant', content: string }]
export async function getBluebirdRecentHistory(n = 30) {
  const all = await _loadHistory();
  return all.slice(-n).map(m => ({
    role:    m.role === 'user' ? 'user' : 'assistant',
    content: m.text ?? '',
  }));
}

// Full history count (useful for logging/debug).
export async function getBluebirdHistoryCount() {
  const all = await _loadHistory();
  return all.length;
}
