const { app, BrowserWindow, Menu, ipcMain, powerSaveBlocker, screen } = require('electron');
const path = require('path');

const windows = new Set();
let blockerId = null;
const awakeWanted = new Set(); // window ids currently requesting keep-awake

function nextBounds() {
  const displays = screen.getAllDisplays();
  // Prefer a display that has no Alarping window on it yet; otherwise cascade.
  const used = new Set();
  for (const w of windows) {
    if (w.isDestroyed()) continue;
    const d = screen.getDisplayMatching(w.getBounds());
    used.add(d.id);
  }
  const free = displays.find((d) => !used.has(d.id));
  const target = free || displays[windows.size % displays.length] || displays[0];
  const { x, y, width, height } = target.workArea;
  if (free) {
    // Fresh monitor: fill most of it, centered.
    const w = Math.min(1440, width - 40);
    const h = Math.min(900, height - 40);
    return { x: x + Math.round((width - w) / 2), y: y + Math.round((height - h) / 2), width: w, height: h };
  }
  // Same monitor as an existing window: cascade so they don't fully overlap.
  const offset = (windows.size % 8) * 32;
  const w = Math.min(1440, width - 40);
  const h = Math.min(900, height - 40);
  return { x: x + 40 + offset, y: y + 40 + offset, width: w, height: h };
}

function createWindow() {
  const bounds = windows.size ? nextBounds() : { width: 1440, height: 900 };
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 760,
    minHeight: 480,
    title: 'Alarping',
    backgroundColor: '#0c0c0c',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#121212', symbolColor: '#bdbdbd', height: 38 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  windows.add(win);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('enter-full-screen', () => win.webContents.send('fs', true));
  win.on('leave-full-screen', () => win.webContents.send('fs', false));
  win.on('closed', () => {
    windows.delete(win);
    awakeWanted.delete(win.id);
    syncKeepAwake();
  });
  win.webContents.send('window-count', windows.size);
  broadcastWindowCount();
  return win;
}

function broadcastWindowCount() {
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send('window-count', windows.size);
}

function syncKeepAwake() {
  const want = awakeWanted.size > 0;
  if (want && blockerId === null) blockerId = powerSaveBlocker.start('prevent-display-sleep');
  if (!want && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
}

Menu.setApplicationMenu(null);

ipcMain.on('new-window', () => createWindow());

ipcMain.on('fullscreen', (e, on) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  win.setFullScreen(typeof on === 'boolean' ? on : !win.isFullScreen());
});

ipcMain.on('keep-awake', (e, on) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (on) awakeWanted.add(win.id); else awakeWanted.delete(win.id);
  syncKeepAwake();
});

ipcMain.on('devtools', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.webContents.toggleDevTools();
});

ipcMain.handle('window-count', () => windows.size);

app.setAppUserModelId('dev.alarping.app');
// Allow launching the .exe again to pop open another window instead of just
// refusing — that's the easiest route to "another window" from outside the app.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => createWindow());
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (windows.size === 0) createWindow(); });
