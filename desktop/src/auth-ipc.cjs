const fieldsByOperation = {
  session: [], logout: [], login: ['username', 'pin'],
  setup: ['username', 'pin', 'recoveryEmail'], credentials: ['username', 'pin', 'currentPin', 'recoveryEmail'],
  'recovery-request': ['email'], 'recovery-reset': ['email', 'code', 'pin'],
}

function registerAuthIpc(ipcMain, window, backend) {
  ipcMain.handle('auth:request', (event, operation, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Origen no autorizado.')
    }
    if (!Object.hasOwn(fieldsByOperation, operation)) throw new Error('Operación no permitida.')
    const fields = fieldsByOperation[operation]
    if (fields.length) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
          Object.keys(payload).length !== fields.length ||
          !fields.every((key) => typeof payload[key] === 'string' && payload[key].length <= (key === 'email' || key === 'recoveryEmail' ? 254 : 100))) {
        return { ok: false, status: 400, body: { code: 'INVALID_INPUT', message: 'Revisa los datos del formulario.' } }
      }
    } else if (payload !== undefined) throw new Error('La operación no admite datos.')
    return backend.auth(operation, payload)
  })
}

module.exports = { registerAuthIpc }
