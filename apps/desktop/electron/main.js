const { app, BrowserWindow, session } = require('electron');
const { spawn } = require('node:child_process');
const path = require('path');
const { resolveBackendRuntimeTarget } = require('./runtimeConfig');

let mainWindow = null;
const isDev = !app.isPackaged;
const devServerUrl = process.env.COVAVISION_DEV_URL || 'http://localhost:5173';
let backendProcess = null;

function startPackagedBackend(runtimeTarget) {
  if (!runtimeTarget.usesLocalBackend || !runtimeTarget.backendExecutable) return;
  const dataDir = path.join(app.getPath('userData'), 'data');
  backendProcess = spawn(runtimeTarget.backendExecutable, [], {
    cwd: path.dirname(runtimeTarget.backendExecutable),
    env: {
      ...process.env,
      API_HOST: '127.0.0.1',
      API_PORT: '8000',
      COVAVISION_DATA_DIR: dataDir,
      INSIGHTFACE_HOME: runtimeTarget.insightfaceHome,
      PRISMA_SCHEMA_PATH: runtimeTarget.prismaSchema,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  backendProcess.on('error', error => {
    console.error(`[Backend] Không thể khởi động runtime: ${error.message}`);
  });
}

function stopPackagedBackend() {
  if (!backendProcess || backendProcess.killed) return;
  backendProcess.kill();
  backendProcess = null;
}

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

  const runtimeTarget = resolveBackendRuntimeTarget({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    platform: process.platform,
  });
  startPackagedBackend(runtimeTarget);
  createWindow(runtimeTarget);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', stopPackagedBackend);

app.on('activate', () => {
  if (!mainWindow) {
    const runtimeTarget = resolveBackendRuntimeTarget({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      platform: process.platform,
    });
    createWindow(runtimeTarget);
  }
});
