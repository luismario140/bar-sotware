const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const operations = new Set(['list', 'create', 'update', 'status', 'image'])

function registerCatalogIpc(ipcMain, window, backend) {
  ipcMain.handle('catalog:request', (event, operation, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origen no autorizado.')
    if (!operations.has(operation)) throw new Error('Operación no permitida.')
    if (operation === 'list') {
      if (payload !== undefined) throw new Error('La operación no admite datos.')
    } else {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Solicitud de producto inválida.')
      if (operation !== 'create' && (typeof payload.id !== 'string' || !uuid.test(payload.id))) throw new Error('Identificador inválido.')
      if (JSON.stringify(payload).length > 8 * 1024 * 1024) throw new Error('La solicitud es demasiado grande.')
    }
    return backend.catalog(operation, payload)
  })
}

module.exports = { registerCatalogIpc }
