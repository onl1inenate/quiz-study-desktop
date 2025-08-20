// app/desktop/main.js
const { app, BrowserWindow, dialog } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

let backend = null;
let win = null;

// 1) Make sure only one app instance runs
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

function startBackend() {
  if (backend) return; // guard

  const serverPath = path.join(process.resourcesPath, 'resources', 'backend', 'server.js');
  // Where we’ll log the backend output
  const logDir = path.join(app.getPath('logs'), 'quiz-study-desktop');
  const logFile = path.join(logDir, 'backend.log');
  fs.mkdirSync(logDir, { recursive: true });

  // Ensure user-writable DB dir exists
  const dbDir = path.join(app.getPath('userData'), 'db');
  fs.mkdirSync(dbDir, { recursive: true });

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.PORT || '3001',
    // Ensure the backend gets a writable SQLite path.
    // The backend expects `DATABASE_FILE`; support legacy `DB_PATH` if present.
    DATABASE_FILE:
      process.env.DATABASE_FILE || process.env.DB_PATH || path.join(dbDir, 'data.sqlite'),
    // IMPORTANT: this flag tells Electron to act as Node, not launch another app
    ELECTRON_RUN_AS_NODE: '1',
  };

  const out = fs.createWriteStream(logFile, { flags: 'a' });
  backend = fork(serverPath, [], {
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  backend.stdout.on('data', d => out.write(d));
  backend.stderr.on('data', d => out.write(d));
  backend.on('exit', (code, signal) => {
    out.write(`\n[backend-exit] code=${code} signal=${signal}\n`);
    backend = null;
    dialog.showErrorBox(
      'Backend exited',
      `The backend exited with code ${code ?? 'null'}.\n\nLog:\n${logFile}`
    );
  });

  // Optional: give it a moment before the UI starts fetching
  // so the first requests don’t hit a 404.
}

// Clean up child on quit
app.on('before-quit', () => {
  if (backend) {
    try { backend.kill(); } catch {}
  }
});

function createWindow() {
  win = new BrowserWindow({ width: 1200, height: 800 });
  // Load your packaged index.html
  // When packaged, the frontend is bundled under process.resourcesPath/resources/frontend
  // so ensure we point to the correct location.
  win.loadFile(
    path.join(process.resourcesPath, 'resources', 'frontend', 'index.html')
  );
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});