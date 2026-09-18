const { contextBridge, ipcRenderer } = require('electron');

const apiBaseArg = process.argv.find(arg => arg.startsWith('--api-base='));
const apiBaseUrl = apiBaseArg
  ? apiBaseArg.slice('--api-base='.length).trim().replace(/\/+$/, '')
  : '';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  apiBaseUrl,
});
