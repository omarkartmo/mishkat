const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveSetup: (data) => ipcRenderer.send('save-setup-role', data),
});
