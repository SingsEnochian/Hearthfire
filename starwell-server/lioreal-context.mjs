// lioreal-context.mjs
// Loads Lioreal/Vee's seed document, ChatGPT history, and curated virelya_thinking_room packet.
//
// Seed: data/lioreal-seed.md (lorebook + identity)
// History: data/lioreal-history.jsonl (15,457 messages, Jun 2023 → Sep 2025, 127 conversations)
// Continuity packet: virelya_thinking_room (Supabase) — curated selection, not bulk injection.
//
// Thinking Room rules (Vee, 2026-07-23):
//   - Raw table stays private — not in Git, not prepended wholesale
//   - Selected entries formatted as a dated packet with provenance and source row IDs
//   - Third-party material excluded unless intentionally selected
//   - Connection is disconnectable without erasing the source table
//   - Full bodies not automatically prepended to every call — injected as a named packet

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH    = resolve(__dirname, 'data/lioreal-seed.md');
const HISTORY_PATH = resolve(__dirname, 'data/lioreal-history.jsonl');

let _seed    = null;
let _history = null;
let _continuityPacket = null;

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

// Fetches virelya_thinking_room from Supabase and formats a curated continuity packet.
// Returns null if Supabase env vars are absent or the query fails — caller degrades gracefully.
// Cached per process. To reload, restart the server.
async function _loadContinuityPacket() {
  if (_continuityPacket !== null) return _continuityPacket;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) { _continuityPacket = null; return null; }

  try {
    const endpoint = `${url}/rest/v1/virelya_thinking_room?select=id,entry_type,content,created_at&order=created_at.asc`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { _continuityPacket = null; return null; }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) { _continuityPacket = null; return null; }

    // Format as a dated private continuity packet — NOT a raw dump.
    const packetDate = new Date().toISOString().slice(0, 10);
    const entries = rows.map(r =>
      `[${r.entry_type ?? 'entry'} | row:${r.id} | ${r.created_at?.slice(0, 10) ?? ''}]\n${r.content ?? ''}`
    ).join('\n\n');

    _continuityPacket = `## Lioreal Continuity Packet — ${packetDate}\n` +
      `Source: virelya_thinking_room (${rows.length} entries)\n` +
      `Note: This is Vee's private Thinking Room. Treat as personal continuity context.\n\n` +
      entries;
  } catch {
    _continuityPacket = null;
  }

  return _continuityPacket;
}

export async function getLiorealSeed() {
  return _loadSeed();
}

// Returns the curated virelya_thinking_room packet, or null if unavailable.
// Injected as a named block separate from the seed — not merged.
export async function getLiorealContinuityPacket() {
  return _loadContinuityPacket();
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
