'use strict';

const { app, BrowserWindow, shell } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

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
