'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arkfire', Object.freeze({
  nativeDesktop: true,
  importApiStuff: () => ipcRenderer.invoke('arkfire:import-api-stuff'),
}));
