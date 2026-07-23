#!/usr/bin/env node
// fleet-health.mjs
// Ping all four Ollama instances and report which are live and what models are loaded.
// Usage: node fleet-health.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually — no external dependency
try {
  const envText = readFileSync(resolve(__dirname, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch { /* .env optional */ }

const FLEET = [
  { name: 'Qwythos  (Boxfire base)', url: process.env.OLLAMA_URL_QWYTHOS || 'http://127.0.0.1:11434', port: 11434 },
  { name: 'Yggdrasil',               url: process.env.OLLAMA_URL_YGG     || 'http://127.0.0.1:11435', port: 11435 },
  { name: 'GLM-4    (Vethrlauf)',     url: process.env.OLLAMA_URL_GLM4    || 'http://127.0.0.1:11436', port: 11436 },
  { name: 'DeepSeek R1',             url: process.env.OLLAMA_URL_R1      || 'http://127.0.0.1:11437', port: 11437 },
];

async function probe({ name, url }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) return { name, url, ok: false, models: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models ?? []).map(m => m.name);
    return { name, url, ok: true, models };
  } catch (err) {
    clearTimeout(timer);
    const error = err.name === 'AbortError' ? 'timeout (5s)' : err.message;
    return { name, url, ok: false, models: [], error };
  }
}

const results = await Promise.all(FLEET.map(probe));

const W = 54;
console.log('\n' + '─'.repeat(W));
console.log(' Ollama Fleet Health');
console.log('─'.repeat(W));

let live = 0;
for (const r of results) {
  live += r.ok ? 1 : 0;
  const mark = r.ok ? '✓' : '✗';
  console.log(`\n ${mark} ${r.name}`);
  console.log(`   ${r.url}`);
  if (r.ok) {
    if (r.models.length === 0) {
      console.log('   (no models loaded)');
    } else {
      for (const m of r.models) console.log(`   · ${m}`);
    }
  } else {
    console.log(`   ! ${r.error}`);
  }
}

console.log('\n' + '─'.repeat(W));
console.log(` ${live}/${results.length} instances reachable`);
console.log('─'.repeat(W) + '\n');

if (live === 0) {
  console.log('Run .\\start-ollama-fleet.ps1 to start the fleet.\n');
}
