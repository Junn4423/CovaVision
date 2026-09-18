const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { resolveBackendRuntimeTarget } = require('./runtimeConfig');

let mainWindow = null;
const isDev = !app.isPackaged;
const devServerUrl = process.env.COVAVISION_DEV_URL || 'http://localhost:5173';

function createWindow(runtimeTarget) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'CovaVision - Chấm công khuôn mặt',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--api-base=${runtimeTarget.apiBaseUrl}`],
    },
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    autoHideMenuBar: true,
  });

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') mainWindow.webContents.toggleDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const allowedPermissions = new Set(['media', 'mediaKeySystem', 'clipboard-read']);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });

  // Chromium performs a permission check before it emits the permission
  // request. Handling both hooks is required for getUserMedia in Electron.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return allowedPermissions.has(permission);
  });

  createWindow(resolveBackendRuntimeTarget());
});

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (!mainWindow) createWindow(resolveBackendRuntimeTarget());
});
