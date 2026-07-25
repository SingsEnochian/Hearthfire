import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requiredFiles = [
  'package.json',
  'arkfire.module.json',
  'adapters/hearthgate.adapter.json',
  'electron/main.cjs',
  'public/index.html',
  'src/store.mjs',
  'src/ollama.mjs',
  'src/server.mjs',
];

for (const relativePath of requiredFiles) {
  await access(resolve(root, relativePath));
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'arkfire.module.json'), 'utf8'));
const adapter = JSON.parse(await readFile(resolve(root, 'adapters/hearthgate.adapter.json'), 'utf8'));

if (manifest.schemaVersion !== 'arkfire.module/v1') throw new Error('Manifest must use arkfire.module/v1');
if (manifest.moduleId !== 'arkfire.models') throw new Error('Unexpected moduleId');
if (manifest.standalone !== true) throw new Error('Arkfire module must declare standalone: true');
if (!manifest.standaloneEntrypoints?.service || !manifest.standaloneHealthCheck) {
  throw new Error('Manifest lacks standalone entrypoint or health check');
}
if (adapter.moduleId !== manifest.moduleId || adapter.optional !== true || adapter.reversible !== true) {
  throw new Error('Hearthgate adapter is not optional and reversible');
}
if (packageJson.main !== 'electron/main.cjs') throw new Error('Electron main entrypoint mismatch');
if (!packageJson.build?.files?.includes('arkfire.module.json')) throw new Error('Installer does not include module manifest');
if (packageJson.build?.files?.some((entry) => entry === 'data/**')) throw new Error('Runtime data must not be packaged');
if (packageJson.build?.nsis?.deleteAppDataOnUninstall !== false) {
  throw new Error('Uninstall must not silently delete module data');
}

console.log('Model Foundry packaging preflight passed.');
console.log(`Module: ${manifest.canonicalName} ${manifest.version}`);
console.log(`Installer: ${packageJson.build.artifactName}`);
console.log('Signing: unsigned development build');
