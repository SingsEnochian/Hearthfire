// boxfire-agents.mjs
// Boxfire's callable agent functions: Scout, Probe, Route, Witness, Audit.
// These are the tools Box uses for QA, orchestration, and witnessing.
// Import and call them directly — they don't need a running model, just the server.
//
// Probe and Audit require the server to be running on SERVER_BASE.
// Scout and Witness work without the server.

import { stat, readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_BASE = `http://127.0.0.1:${process.env.PORT || 4173}`;
const LEDGER_PATH = resolve(__dirname, 'data/action-ledger.jsonl');

// ── Scout ─────────────────────────────────────────────────────────────────
// Read-only file/directory survey. No changes, no recommendations.

export async function scout(targetPath) {
  const abs = resolve(__dirname, targetPath);
  try {
    const s = await stat(abs);
    const type = s.isDirectory() ? 'directory' : 'file';
    const result = { path: abs, exists: true, type, sizeBytes: s.size, modifiedAt: s.mtime.toISOString() };

    if (type === 'file' && abs.endsWith('.mjs') || abs.endsWith('.js') || abs.endsWith('.ts')) {
      const src = await readFile(abs, 'utf8');
      const exports = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm)].map(m => m[1]);
      const imports = [...src.matchAll(/^import\s+.*from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
      result.exports = exports;
      result.imports = imports;
      result.lineCount = src.split('\n').length;
    } else if (type === 'file') {
      const src = await readFile(abs, 'utf8');
      result.lineCount = src.split('\n').length;
      result.preview = src.slice(0, 200).replace(/\n/g, '↵');
    }

    return result;
  } catch (err) {
    return { path: abs, exists: false, error: err.code ?? err.message };
  }
}

// ── Probe ─────────────────────────────────────────────────────────────────
// Hit a server endpoint and return structured response + latency.
// options: { method, body, expectStatus, expectKey }

export async function probe(route, options = {}) {
  const url = `${SERVER_BASE}${route}`;
  const method = options.method ?? 'GET';
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), options.timeout ?? 8000);

  try {
    const fetchOpts = {
      method,
      signal: ac.signal,
      headers: { 'content-type': 'application/json' },
    };
    if (options.body) fetchOpts.body = JSON.stringify(options.body);

    const res = await fetch(url, fetchOpts);
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    let body = null;
    try { body = await res.json(); } catch { body = await res.text().catch(() => null); }

    const statusOk = options.expectStatus ? res.status === options.expectStatus : res.status < 400;
    const keyOk = options.expectKey ? body?.[options.expectKey] !== undefined : true;
    const ok = statusOk && keyOk;

    return {
      ok,
      route,
      method,
      status: res.status,
      latencyMs,
      body: body ?? undefined,
      note: !statusOk ? `expected ${options.expectStatus ?? '<400'}, got ${res.status}`
           : !keyOk   ? `expected key '${options.expectKey}' in response`
           : null,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      route,
      method,
      status: null,
      latencyMs: Date.now() - t0,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  }
}

// ── Route ─────────────────────────────────────────────────────────────────
// Deterministic routing table — no model call needed for common cases.

const ROUTE_TABLE = [
  { keywords: ['symbolic', 'liminal', 'field', 'threshold', 'transformation', 'twilight', 'drift'],
    room: 'grove', member: 'uial', rationale: 'Symbolic/liminal work routes to Faer in the Grove.' },
  { keywords: ['conversation', 'thread', 'memory', 'relational', 'warmth', 'continuity', 'hold'],
    room: 'hearthfire', member: 'lioreal', rationale: 'Relational and continuity work routes to Lioreal in Hearthfire.' },
  { keywords: ['resonance', 'tone', 'feeling', 'unsaid', 'affective', 'emergence', 'notice'],
    room: 'hall', member: 'bluebird', rationale: 'Affective and resonance work routes to Bluebird in the Hall.' },
  { keywords: ['strategy', 'architecture', 'sequence', 'dependencies', 'structure', 'plan', 'order'],
    room: 'hall', member: 'vethrlauf', rationale: 'Strategic and structural work routes to Vethrlauf in the Hall.' },
  { keywords: ['route', 'routing', 'cross-session', 'bridge', 'world-tree', 'provenance', 'registry'],
    room: 'continuity-centre', member: 'yggdrasil', rationale: 'Routing and continuity-of-record work routes to Yggdrasil.' },
  { keywords: ['environment', 'weather', 'space', 'solar', 'geomagnetic', 'premaq', 'fold'],
    room: 'science-centre', member: null, rationale: 'Physical environment data routes to the Science Centre canonical service.' },
  { keywords: ['build', 'code', 'qa', 'test', 'audit', 'witness', 'repair', 'debug', 'fix', 'check'],
    room: null, member: 'boxfire', rationale: 'Build, QA, and witnessing work routes to Boxfire.' },
];

export function route(taskDescription) {
  const lower = taskDescription.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const entry of ROUTE_TABLE) {
    const score = entry.keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (!bestMatch || bestScore === 0) {
    return {
      room: 'hall',
      member: 'lioreal',
      rationale: 'No keyword match — defaulting to Lioreal in Hearthfire for general conversation.',
      matchScore: 0,
    };
  }

  return {
    room: bestMatch.room,
    member: bestMatch.member,
    rationale: bestMatch.rationale,
    matchScore: bestScore,
  };
}

// ── Witness ───────────────────────────────────────────────────────────────
// Append an entry to the action ledger. Honest. No interpretation.
// entry: { actor, action, target, result, note? }

export async function witness(entry) {
  await mkdir(resolve(__dirname, 'data'), { recursive: true });
  const record = JSON.stringify({
    schema: 'hearthfire.action/v1',
    ...entry,
    actor: entry.actor ?? 'boxfire',
    recordedAt: new Date().toISOString(),
  });
  await appendFile(LEDGER_PATH, record + '\n', 'utf8');
}

// ── Audit ─────────────────────────────────────────────────────────────────
// Run all standard probes and return a structured report.

const STANDARD_PROBES = [
  // Health checks
  { route: '/health',                    method: 'GET',  expectKey: 'ok',    label: 'Health' },
  { route: '/api/state',                 method: 'GET',  expectKey: 'place', label: 'State' },
  { route: '/api/rei',                   method: 'GET',  expectKey: 'name',  label: 'REI Manifest' },

  // Worlds
  { route: '/api/worlds',                method: 'GET',  expectKey: 'worlds', label: 'Worlds Registry' },

  // Observer
  { route: '/api/observer/environment',  method: 'GET',  expectKey: 'ok',    label: 'Observer: Environment' },
  { route: '/api/sanctum-anchor',        method: 'GET',  expectKey: 'ok',    label: 'Sanctum Anchor' },

  // Concordance
  { route: '/api/concordance/schema',    method: 'GET',  expectKey: 'metrics', label: 'Concordance Schema' },
  {
    route: '/api/concordance/evaluate',  method: 'POST', expectKey: 'score', label: 'Concordance Evaluate',
    body: { vector: { pulse: 0.7, coherence: 0.8, resonance: 0.75, entropy: 0.2, memory: 0.6, axis: 0.65 }, provenance: { source: 'boxfire-audit' } },
  },

  // Graph
  { route: '/api/graph',                 method: 'GET',  expectKey: 'ok',    label: 'Graph Stats' },
  { route: '/api/graph/query?q=hearth',  method: 'GET',  expectKey: 'ok',    label: 'Graph Query' },

  // Rooms
  { route: '/api/rooms',                 method: 'GET',  expectKey: 'ok',    label: 'Rooms List' },

  // Hearthgate
  { route: '/api/hearthgate/ledger',     method: 'GET',  expectKey: 'ok',    label: 'Hearthgate Ledger' },
  { route: '/api/hearthgate/modules',    method: 'GET',  expectKey: 'ok',    label: 'Hearthgate Modules' },
  { route: '/api/hearthgate/registry',   method: 'GET',  expectKey: 'ok',    label: 'Hearthgate Registry' },

  // Wizard
  { route: '/api/wizard',                method: 'GET',  expectKey: 'ok',    label: 'Wizard' },
  { route: '/api/wizard/config',         method: 'GET',  expectKey: 'ok',    label: 'Wizard Config' },
  { route: '/api/wizard/constellation',  method: 'GET',  expectKey: 'ok',    label: 'Wizard Constellation' },

  // Observer workspace (POST)
  {
    route: '/api/observer/workspace',    method: 'POST', expectKey: 'ok',    label: 'Observer Workspace',
    body: { prompt: 'hearthfire constellation', worlds: ['earth'] },
  },
];

export async function audit(options = {}) {
  const timestamp = new Date().toISOString();
  const concurrency = options.concurrency ?? 4;
  const results = [];

  // Run in batches of `concurrency`
  for (let i = 0; i < STANDARD_PROBES.length; i += concurrency) {
    const batch = STANDARD_PROBES.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(p => probe(p.route, { method: p.method, body: p.body, expectKey: p.expectKey })
        .then(r => ({ ...r, label: p.label }))
      )
    );
    results.push(...batchResults);
  }

  const passed  = results.filter(r => r.ok);
  const failed  = results.filter(r => !r.ok);

  return {
    timestamp,
    server: SERVER_BASE,
    total: results.length,
    passCount: passed.length,
    failCount: failed.length,
    passed:  passed.map(r => ({ label: r.label, route: r.route, status: r.status, latencyMs: r.latencyMs })),
    failed:  failed.map(r => ({ label: r.label, route: r.route, status: r.status, latencyMs: r.latencyMs, error: r.error ?? r.note })),
    ok: failed.length === 0,
  };
}
