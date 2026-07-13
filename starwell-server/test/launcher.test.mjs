import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('Gabriel launcher updates safely and exposes the live thresholds', async () => {
  const launcher = await readFile(resolve(root, 'start-starwell.cmd'), 'utf8');

  assert.match(launcher, /git pull --ff-only origin main/i);
  assert.match(launcher, /git status --porcelain/i);
  assert.match(launcher, /Nothing was overwritten/i);
  assert.match(launcher, /tailscale ip -4/i);
  assert.match(launcher, /Node 24 or newer/i);
  assert.match(launcher, /\/api\/rei/i);
  assert.match(launcher, /\/api\/concordance\/schema/i);
  assert.match(launcher, /node server\.mjs/i);
  assert.doesNotMatch(launcher, /\bnecho\b/i);
  assert.doesNotMatch(launcher, /git reset --hard/i);
  assert.doesNotMatch(launcher, /git clean -/i);
});
