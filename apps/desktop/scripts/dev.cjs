const { spawn } = require('node:child_process')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = []
let shuttingDown = false

function start(command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  children.push(child)
  return child
}

function stopAll() {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
}

async function waitForDevServer() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:5173')
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Vite không khởi động được trên http://127.0.0.1:5173')
}

async function main() {
  const vite = start(npmCommand, ['run', 'dev:react'])
  await waitForDevServer()
  const electron = start(npmCommand, ['run', 'dev:electron'])

  vite.once('exit', code => {
    if (!shuttingDown && code && code !== 0) {
      console.error(`[Vite] exited with code ${code}`)
      stopAll()
      process.exitCode = code
    }
  })
  electron.once('exit', code => {
    if (!shuttingDown) process.exitCode = code || 0
    stopAll()
  })
}

process.on('SIGINT', () => {
  stopAll()
  process.exitCode = 0
})
process.on('SIGTERM', () => {
  stopAll()
  process.exitCode = 0
})

main().catch(error => {
  console.error(`[CovaVision] ${error.message}`)
  stopAll()
  process.exitCode = 1
})
