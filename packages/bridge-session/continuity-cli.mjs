#!/usr/bin/env node

import { resolve } from 'node:path';
import { ContinuityExporter } from './src/continuity-exporter.mjs';

function parseArgs(argv) {
  const [command = 'health', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = rest[index + 1]?.startsWith('--') ? true : rest[++index] ?? true;
    options[key] = value;
  }
  return { command, options };
}

function exporter(options) {
  return new ContinuityExporter({
    dataDirectory: resolve(String(options.data ?? './data')),
  });
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runHealth(options) {
  writeJson(await exporter(options).health());
}

async function runExport(options) {
  const store = exporter(options);
  const reviewed = await store.latestReviewedLamination();
  writeJson(await store.exportAccepted({
    review_id: String(options.review ?? reviewed?.review?.review_id ?? ''),
    exported_by: String(options.by ?? reviewed?.review?.reviewer ?? 'Rowan'),
    notes: options.notes ? String(options.notes) : null,
  }));
}

async function runLatest(options) {
  writeJson(await exporter(options).latest());
}

async function runReplay(options) {
  writeJson(await exporter(options).replay());
}

const { command, options } = parseArgs(process.argv.slice(2));

try {
  if (command === 'health') await runHealth(options);
  else if (command === 'export') await runExport(options);
  else if (command === 'latest') await runLatest(options);
  else if (command === 'replay') await runReplay(options);
  else {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exitCode = 2;
  }
} catch (error) {
  writeJson({
    ok: false,
    error: error?.code ?? error?.name ?? 'continuity-export-error',
    message: error?.message ?? String(error),
  });
  process.exitCode = 1;
}
