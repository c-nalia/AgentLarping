const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alarping', {
  native: true,
  fullscreen: (on) => ipcRenderer.send('fullscreen', on),
  keepAwake: (on) => ipcRenderer.send('keep-awake', on),
  devtools: () => ipcRenderer.send('devtools'),
  newWindow: () => ipcRenderer.send('new-window'),
  onFullscreen: (cb) => ipcRenderer.on('fs', (_e, v) => cb(v)),
  onWindowCount: (cb) => ipcRenderer.on('window-count', (_e, n) => cb(n)),
});
