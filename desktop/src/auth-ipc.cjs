const operations = new Set(['session', 'setup', 'login', 'logout', 'credentials'])

function registerAuthIpc(ipcMain, window, backend) {
  ipcMain.handle('auth:request', (event, operation, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Origen no autorizado.')
    }
    if (!operations.has(operation)) throw new Error('Operación no permitida.')
    const fields = operation === 'credentials' ? ['username', 'pin', 'currentPin']
      : operation === 'setup' || operation === 'login' ? ['username', 'pin'] : []
    if (fields.length) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
          Object.keys(payload).length !== fields.length ||
          !fields.every((key) => typeof payload[key] === 'string' && payload[key].length <= 100)) {
        return { ok: false, status: 400, body: { code: 'INVALID_INPUT', message: 'Revisa los datos del formulario.' } }
      }
    } else if (payload !== undefined) throw new Error('La operación no admite datos.')
    return backend.auth(operation, payload)
  })
}

module.exports = { registerAuthIpc }
