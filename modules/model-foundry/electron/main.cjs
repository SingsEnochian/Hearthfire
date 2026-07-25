'use strict';

const { app, BrowserWindow, shell, ipcMain, dialog, safeStorage } = require('electron');
const { readFile, writeFile, mkdir, rename } = require('node:fs/promises');
const { join, basename, dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');

let mainWindow = null;
let runtime = null;

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#0a0d14',
    title: 'Arkfire Model Foundry',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('https://')) shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(url);
}

function credentialsPath() {
  return join(app.getPath('userData'), 'ModelFoundry', 'credentials.enc.json');
}

async function readCredentialStore() {
  try {
    const raw = await readFile(credentialsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object'
      ? parsed
      : { schemaVersion: 'arkfire.encrypted-credentials/v1', entries: {} };
  } catch (error) {
    if (error?.code === 'ENOENT') return { schemaVersion: 'arkfire.encrypted-credentials/v1', entries: {} };
    throw error;
  }
}

async function writeCredentialStore(store) {
  const target = credentialsPath();
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
}

function encryptedRecord(value, metadata) {
  if (!safeStorage.isEncryptionAvailable()) {
    const error = new Error('Windows secure credential encryption is unavailable on this system. No plaintext fallback was used.');
    error.code = 'secure-storage-unavailable';
    throw error;
  }
  return {
    ...metadata,
    encryptedValue: safeStorage.encryptString(String(value)).toString('base64'),
  };
}

async function importApiStuffFile(filePath) {
  if (!runtime) throw new Error('Model Foundry service is not running');
  const parserUrl = pathToFileURL(join(__dirname, '..', 'src', 'api-stuff-parser.mjs')).href;
  const { parseApiStuff, secretFreeImportSummary } = await import(parserUrl);
  const text = await readFile(filePath, 'utf8');
  const parsed = parseApiStuff(text);
  const importedAt = new Date().toISOString();
  const sourceFile = basename(filePath);
  const credentialStore = await readCredentialStore();
  const providerMetadata = [];
  const integrationMetadata = [];

  for (const provider of parsed.providers) {
    const credentialRef = `credential://arkfire.models/${provider.providerId}/api-key`;
    credentialStore.entries[credentialRef] = encryptedRecord(provider.secretValue, {
      targetType: 'model-provider',
      targetId: provider.providerId,
      slot: 'apiKey',
      sourceFile,
      sourceLabel: provider.sourceLabel,
      importedAt,
    });
    const { secretValue: _secretValue, ...metadata } = provider;
    providerMetadata.push({
      ...metadata,
      credentialRef,
      credentialStatus: 'stored-encrypted',
      credentialImportedAt: importedAt,
      invocationLocked: true,
    });
  }

  for (const integration of parsed.integrations) {
    const credentialRefs = {};
    for (const credential of integration.credentials) {
      const credentialRef = `credential://arkfire.bridges/${integration.integrationId}/${credential.slot}`;
      credentialStore.entries[credentialRef] = encryptedRecord(credential.secretValue, {
        targetType: 'bridge-integration',
        targetId: integration.integrationId,
        slot: credential.slot,
        sourceFile,
        sourceLabel: credential.sourceLabel,
        importedAt,
      });
      credentialRefs[credential.slot] = credentialRef;
    }
    integrationMetadata.push({
      integrationId: integration.integrationId,
      displayName: integration.displayName,
      kind: integration.kind,
      destinationModule: integration.destinationModule,
      endpoint: integration.endpoint,
      credentialRefs,
      sourceLabels: integration.sourceLabels,
      status: 'classified-not-connected',
      importedAt,
    });
  }

  await writeCredentialStore({
    schemaVersion: 'arkfire.encrypted-credentials/v1',
    updatedAt: importedAt,
    entries: credentialStore.entries,
  });
  const registry = await runtime.store.applyCredentialImport({ providers: providerMetadata, integrations: integrationMetadata });
  const summary = secretFreeImportSummary(parsed);

  return {
    cancelled: false,
    sourceFile,
    providerCount: providerMetadata.length,
    integrationCount: integrationMetadata.length,
    unknownLabels: summary.unknownLabels,
    duplicateLabels: summary.duplicateLabels,
    providerNames: summary.providers.map((provider) => provider.displayName),
    integrationNames: summary.integrations.map((integration) => integration.displayName),
    registryRevision: registry.revision,
  };
}

ipcMain.handle('arkfire:import-api-stuff', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import API Stuff.txt',
    properties: ['openFile'],
    filters: [
      { name: 'API Stuff text', extensions: ['txt'] },
      { name: 'Text files', extensions: ['txt', 'env'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  return importApiStuffFile(result.filePaths[0]);
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  const serverModuleUrl = pathToFileURL(join(__dirname, '..', 'src', 'server.mjs')).href;
  const { startFoundryServer } = await import(serverModuleUrl);
  runtime = await startFoundryServer({
    host: '127.0.0.1',
    port: 0,
    dataDirectory: join(app.getPath('userData'), 'ModelFoundry'),
  });
  createWindow(runtime.url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow && runtime) createWindow(runtime.url);
});

app.on('before-quit', (event) => {
  if (!runtime) return;
  event.preventDefault();
  const closing = runtime;
  runtime = null;
  closing.close().catch(() => {}).finally(() => app.quit());
});
