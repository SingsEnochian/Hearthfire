#!/usr/bin/env node
// test-endpoints.mjs
// Boxfire's endpoint test suite. Hits every server route and reports pass/fail.
// Usage: node test-endpoints.mjs
// Requires the server to be running: node server.mjs

import { audit, witness } from './boxfire-agents.mjs';

const W = 60;

function pad(str, len) {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

console.log('\n' + '─'.repeat(W));
console.log(' Boxfire Endpoint Audit');
console.log(' ' + new Date().toLocaleString());
console.log('─'.repeat(W));
console.log(' Running probes...\n');

const report = await audit({ concurrency: 4 });

// Print results
if (report.passed.length > 0) {
  console.log(' PASSED\n');
  for (const r of report.passed) {
    const label = pad(r.label, 32);
    const status = String(r.status ?? '---').padStart(3);
    const ms = String(r.latencyMs) + 'ms';
    console.log(`  ✓ ${label} ${status}  ${ms}`);
  }
}

if (report.failed.length > 0) {
  console.log('\n FAILED\n');
  for (const r of report.failed) {
    const label = pad(r.label, 32);
    const status = String(r.status ?? '---').padStart(3);
    console.log(`  ✗ ${label} ${status}  ${r.error ?? 'no detail'}`);
  }
}

console.log('\n' + '─'.repeat(W));
console.log(` ${report.passCount}/${report.total} passed`);
if (!report.ok) console.log(` ${report.failCount} failed — see above`);
console.log('─'.repeat(W) + '\n');

// Write ledger entry
try {
  await witness({
    actor: 'boxfire',
    action: 'endpoint-audit',
    target: report.server,
    result: report.ok ? 'ok' : 'partial-failure',
    note: `${report.passCount}/${report.total} passed${report.failCount > 0 ? ` — failed: ${report.failed.map(r => r.label).join(', ')}` : ''}`,
  });
  console.log(' Ledger entry written.\n');
} catch {
  console.log(' (Ledger write skipped — data/ directory may not exist yet)\n');
}

process.exit(report.ok ? 0 : 1);
