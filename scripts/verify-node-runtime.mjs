import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

async function readText(path) {
  return (await readFile(path, 'utf8')).trim();
}

async function packageManifests() {
  const manifests = [resolve(root, 'package.json'), resolve(root, 'starwell-server/package.json')];
  try {
    const entries = await readdir(resolve(root, 'packages'), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) manifests.push(resolve(root, 'packages', entry.name, 'package.json'));
    }
  } catch {
    // packages/ is optional until a workspace package exists.
  }
  return manifests;
}

const nvmPinText = await readText(resolve(root, '.nvmrc'));
const nodeVersionText = await readText(resolve(root, '.node-version'));
const pin = parseVersion(nvmPinText, '.nvmrc');
parseVersion(nodeVersionText, '.node-version');

if (nodeVersionText !== nvmPinText) {
  throw new Error(`Node pins disagree: .nvmrc=${nvmPinText}, .node-version=${nodeVersionText}`);
}

const current = parseVersion(process.version, 'running Node');
if (current[0] !== pin[0] || compareVersions(current, pin) < 0) {
  throw new Error(`Unsupported Node ${process.version}. Use Node ${nvmPinText} or a newer ${pin[0]}.x release.`);
}

const expectedRange = `>=${nvmPinText} <${pin[0] + 1}`;
for (const manifestPath of await packageManifests()) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (manifest.engines?.node !== expectedRange) {
    const relative = manifestPath.slice(root.length + 1);
    throw new Error(`${relative} must declare engines.node as "${expectedRange}".`);
  }
}

console.log(`Node runtime verified: ${process.version}; pin ${nvmPinText}; allowed ${expectedRange}`);
