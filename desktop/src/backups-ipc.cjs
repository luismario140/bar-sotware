const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const filenamePattern = /^(?:pre-migration|manual|pre-restore)-\d+-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.zip$/i
const operations = { list: [], create: [], openFolder: [], chooseRestore: [], cancelRestore: [], export: ['filename'], restore: ['id', 'currentPin'] }
const rejected = (message, code = 'BACKUP_UNAVAILABLE', status = 503) => ({ ok: false, status, body: { code, message } })

function registerBackupsIpc(ipcMain, window, { backend, dataDirectory, dialog, shell, restore }) {
  let busy = false
  ipcMain.handle('backups:request', async (event, operation, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origen no autorizado.')
    if (!Object.hasOwn(operations, operation)) throw new Error('Operación no permitida.')
    const fields = operations[operation]
    if (fields.length ? !payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== fields.length || !fields.every(key => typeof payload[key] === 'string' && payload[key].length <= 200) : payload !== undefined) throw new Error('Datos de respaldo inválidos.')
    if (operation === 'list') {
      try { return await backend.backups('list') } catch { return rejected('No se pudieron consultar los respaldos.') }
    }
    if (busy) return rejected('Hay una operación de respaldo en curso. Espera a que termine.')
    busy = true
    try {
      if (operation === 'create' || operation === 'cancelRestore') return await backend.backups(operation)
      const session = await backend.auth('session')
      if (!session.ok || !session.body.authenticated) return rejected('Inicia sesión para administrar los respaldos.', 'UNAUTHENTICATED', 401)
      const root = path.resolve(dataDirectory, 'backups')
      if (operation === 'openFolder') {
        const error = await shell.openPath(root)
        return error ? rejected('No se pudo abrir la carpeta de respaldos.') : { ok: true, status: 200, body: null }
      }
      if (operation === 'chooseRestore') {
        const selection = await dialog.showOpenDialog(window, { title: 'Elegir respaldo de AppBarPOS', defaultPath: root, properties: ['openFile'], filters: [{ name: 'Respaldo de AppBarPOS', extensions: ['zip'] }] })
        if (selection.canceled || selection.filePaths.length !== 1) return { ok: true, status: 200, body: null }
        return await backend.backups('inspect', { path: selection.filePaths[0] })
      }
      if (operation === 'export') {
        if (!filenamePattern.test(payload.filename)) throw new Error('Archivo inválido.')
        const source = path.join(root, payload.filename)
        const info = await fs.lstat(source)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('Archivo inválido.')
        const selection = await dialog.showSaveDialog(window, { title: 'Guardar copia del respaldo', defaultPath: payload.filename, filters: [{ name: 'Respaldo de AppBarPOS', extensions: ['zip'] }] })
        if (selection.canceled || !selection.filePath) return { ok: true, status: 200, body: null }
        const destination = path.resolve(selection.filePath.toLowerCase().endsWith('.zip') ? selection.filePath : selection.filePath + '.zip')
        const same = process.platform === 'win32' ? destination.toLowerCase() === source.toLowerCase() : destination === source
        if (!same) {
          const partial = destination + '.' + randomUUID() + '.part'
          try { await fs.copyFile(source, partial); await fs.rename(partial, destination) }
          finally { try { await fs.unlink(partial) } catch (error) { if (error.code !== 'ENOENT') throw error } }
        }
        return { ok: true, status: 200, body: { saved: true } }
      }
      if (operation === 'restore') {
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(payload.id) || !/^[0-9]{4}$/.test(payload.currentPin)) return rejected('Introduce tu PIN actual de cuatro dígitos.', 'INVALID_INPUT', 400)
        const prepared = await backend.backups('prepareRestore', payload)
        if (!prepared.ok) return prepared
        return await restore(prepared.body.id)
      }
    } catch {
      return rejected('No se pudo completar la operación. Comprueba el archivo, el espacio disponible y los permisos del equipo.')
    } finally { busy = false }
  })
  return { isBusy: () => busy }
}

module.exports = { registerBackupsIpc }
