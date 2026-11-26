#!/usr/bin/env node
/**
 * Cross-platform dev runner that concurrently starts:
 * 1. FastAPI backend server (http://127.0.0.1:8000)
 * 2. Vite frontend dev server (http://127.0.0.1:5173)
 */

const { spawn } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const pythonCmd = isWindows ? 'python' : 'python3';

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', '   LinkSure — Amazon ASIN Integrity & Redirect Verifier');
console.log('\x1b[36m%s\x1b[0m', '==================================================\n');

// 1. Start FastAPI backend
const backend = spawn(pythonCmd, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PYTHONUNBUFFERED: '1' }
});

// 2. Start Vite frontend
const frontend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true,
  env: process.env
});

const cleanup = () => {
  console.log('\nShutting down LinkSure servers...');
  try {
    if (isWindows) {
      spawn('taskkill', ['/pid', backend.pid.toString(), '/f', '/t']);
      spawn('taskkill', ['/pid', frontend.pid.toString(), '/f', '/t']);
    } else {
      backend.kill('SIGTERM');
      frontend.kill('SIGTERM');
    }
  } catch (e) {}
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
