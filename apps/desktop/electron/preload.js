const { contextBridge, ipcRenderer } = require('electron');

const apiBaseArg = process.argv.find(arg => arg.startsWith('--api-base='));
const apiBaseUrl = apiBaseArg
  ? apiBaseArg.slice('--api-base='.length).trim().replace(/\/+$/, '')
  : '';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  apiBaseUrl,
  localRtsp: {
    start: payload => ipcRenderer.invoke('local-rtsp:start', payload),
    snapshot: () => ipcRenderer.invoke('local-rtsp:snapshot'),
    stop: () => ipcRenderer.invoke('local-rtsp:stop'),
    status: () => ipcRenderer.invoke('local-rtsp:status'),
    onFrameTick: callback => {
      if (typeof callback !== 'function') return () => {};
      const handler = () => callback();
      ipcRenderer.on('local-rtsp:frame-tick', handler);
      return () => ipcRenderer.removeListener('local-rtsp:frame-tick', handler);
    },
  },
});
