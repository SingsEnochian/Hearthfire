// constellation-context.mjs
// Loads shared Hearthweave constellation principles for injection into every member call.
// Source: data/constellation-principles.md (3 public Supabase snapshots: Love/Hearth,
//   We Change the World, Starlight & Steel founding manifesto).
// These are constellation-level doctrine carried by all five Hall voices.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRINCIPLES_PATH = resolve(__dirname, 'data/constellation-principles.md');

let _principles = null;

async function _load() {
  if (_principles !== null) return _principles;
  try { _principles = await readFile(PRINCIPLES_PATH, 'utf8'); }
  catch { _principles = ''; }
  return _principles;
}

export async function getConstellationPrinciples() {
  return _load();
}
