const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('appbarpos', {
  health: () => ipcRenderer.invoke('system:health'),
  appInfo: () => ipcRenderer.invoke('system:app-info'),
  auth: (operation, payload) => ipcRenderer.invoke('auth:request', operation, payload),
  catalog: (operation, payload) => ipcRenderer.invoke('catalog:request', operation, payload),
  backups: (operation, payload) => ipcRenderer.invoke('backups:request', operation, payload),
})
