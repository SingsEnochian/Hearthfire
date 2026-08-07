// constellation-context.mjs
// Loads shared Hearthweave constellation principles and the ratified Hearthgate Braided Spine.
// Every constellation member call receives this combined context through arkfire-dispatch.mjs.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRINCIPLES_PATH = resolve(__dirname, 'data/constellation-principles.md');
const BRAIDED_SPINE_PATH = resolve(__dirname, 'data/braided-spine-canon.md');

let _context = null;

async function readText(path) {
  try { return await readFile(path, 'utf8'); }
  catch { return ''; }
}

async function _load() {
  if (_context !== null) return _context;
  const [principles, braidedSpine] = await Promise.all([
    readText(PRINCIPLES_PATH),
    readText(BRAIDED_SPINE_PATH),
  ]);
  _context = [principles, braidedSpine].filter(Boolean).join('\n\n---\n\n');
  return _context;
}

export async function getConstellationPrinciples() {
  return _load();
}
