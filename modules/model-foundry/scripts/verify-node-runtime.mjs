import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(moduleRoot, '../..');

function parseVersion(value, label) {
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`${label} must be an exact semantic version, received: ${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

const nvmPin = (await readFile(resolve(repositoryRoot, '.nvmrc'), 'utf8')).trim();
const nodeVersionPin = (await readFile(resolve(repositoryRoot, '.node-version'), 'utf8')).trim();
if (nvmPin !== nodeVersionPin) throw new Error(`Node pins disagree: ${nvmPin} vs ${nodeVersionPin}`);

const required = parseVersion(nvmPin, '.nvmrc');
const current = parseVersion(process.version, 'running Node');
if (current[0] !== required[0] || compareVersions(current, required) < 0) {
  throw new Error(`Unsupported Node ${process.version}. Use Node ${nvmPin} or a newer ${required[0]}.x release.`);
}

const manifest = JSON.parse(await readFile(resolve(moduleRoot, 'package.json'), 'utf8'));
const expectedRange = `>=${nvmPin} <${required[0] + 1}`;
if (manifest.engines?.node !== expectedRange) {
  throw new Error(`package.json must declare engines.node as "${expectedRange}".`);
}

console.log(`Model Foundry Node runtime verified: ${process.version}; pin ${nvmPin}`);
