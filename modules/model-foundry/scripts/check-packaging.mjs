import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requiredFiles = [
  'package.json',
  'arkfire.module.json',
  'adapters/hearthgate.adapter.json',
  'electron/main.cjs',
  'electron/preload.cjs',
  'public/index.html',
  'src/store.mjs',
  'src/ollama.mjs',
  'src/api-stuff-parser.mjs',
  'src/server.mjs',
];

for (const relativePath of requiredFiles) await access(resolve(root, relativePath));

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'arkfire.module.json'), 'utf8'));
const adapter = JSON.parse(await readFile(resolve(root, 'adapters/hearthgate.adapter.json'), 'utf8'));
const mainSource = await readFile(resolve(root, 'electron/main.cjs'), 'utf8');
const rendererSource = await readFile(resolve(root, 'public/index.html'), 'utf8');
const ollamaSource = await readFile(resolve(root, 'src/ollama.mjs'), 'utf8');

if (manifest.schemaVersion !== 'arkfire.module/v1') throw new Error('Manifest must use arkfire.module/v1');
if (manifest.moduleId !== 'arkfire.models') throw new Error('Unexpected moduleId');
if (manifest.standalone !== true) throw new Error('Arkfire module must declare standalone: true');
if (!manifest.standaloneEntrypoints?.service || !manifest.standaloneHealthCheck) throw new Error('Manifest lacks standalone entrypoint or health check');
if (adapter.moduleId !== manifest.moduleId || adapter.optional !== true || adapter.reversible !== true) throw new Error('Hearthgate adapter is not optional and reversible');
if (packageJson.main !== 'electron/main.cjs') throw new Error('Electron main entrypoint mismatch');
if (!packageJson.build?.files?.includes('arkfire.module.json')) throw new Error('Installer does not include module manifest');
if (packageJson.build?.files?.some((entry) => entry === 'data/**')) throw new Error('Runtime data must not be packaged');
if (packageJson.build?.nsis?.deleteAppDataOnUninstall !== false) throw new Error('Uninstall must not silently delete module data');
if (!mainSource.includes('safeStorage.encryptString')) throw new Error('Desktop import must encrypt credentials with Electron safeStorage');
if (!mainSource.includes('credentials.enc.json')) throw new Error('Encrypted credential store path is missing');
if (rendererSource.includes('secretValue') || rendererSource.includes('apiKey')) throw new Error('Renderer must not handle raw credential fields');
if (!rendererSource.includes('Import API Stuff.txt')) throw new Error('Native API Stuff import control is missing');
if (!rendererSource.includes('credential stored · disabled')) throw new Error('Imported cloud credentials are not labelled clearly');
if (!ollamaSource.includes('external-processing-possible')) throw new Error('Cloud-routed Ollama tags are not classified honestly');

console.log('Model Foundry packaging preflight passed.');
console.log(`Module: ${manifest.canonicalName} ${manifest.version}`);
console.log(`Installer: ${packageJson.build.artifactName}`);
console.log('Credential import: native encrypted store; no renderer plaintext fallback');
console.log('Cloud-routed tags: external-processing-possible');
console.log('Signing: unsigned development build');
