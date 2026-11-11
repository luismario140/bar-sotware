const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('appbarpos', {
  health: () => ipcRenderer.invoke('system:health'),
  auth: (operation, payload) => ipcRenderer.invoke('auth:request', operation, payload),
  catalog: (operation, payload) => ipcRenderer.invoke('catalog:request', operation, payload),
})
