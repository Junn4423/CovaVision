const { spawn } = require('node:child_process');

// The ChatGPT/Codex host may set ELECTRON_RUN_AS_NODE globally. If that
// variable reaches Electron, `require('electron')` starts as plain Node and
// the main process has no `app` object.
const electronBinary = require('electron');
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, ['.'], {
  cwd: process.cwd(),
  env: childEnv,
  stdio: 'inherit',
});

child.on('error', error => {
  console.error(`[Electron] Không thể khởi động: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 0;
});
