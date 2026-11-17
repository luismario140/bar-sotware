const { readdir } = require('node:fs/promises')
const path = require('node:path')

// Solo respaldos completos de AppBarPOS; los .part nunca cuentan.
async function readBackupInfo(dataDirectory) {
  try {
    const entries = await readdir(path.join(dataDirectory, 'backups'), { withFileTypes: true })
    let latest = 0
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const match = /^(?:pre-migration|manual|pre-restore)-(\d+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.zip$/i.exec(entry.name)
      if (!match) continue
      const timestamp = Number(match[1])
      if (Number.isSafeInteger(timestamp) && timestamp > latest && !Number.isNaN(new Date(timestamp).getTime())) latest = timestamp
    }
    return { lastBackupAt: latest ? new Date(latest).toISOString() : null, backupStatus: 'available' }
  } catch (error) {
    return { lastBackupAt: null, backupStatus: error.code === 'ENOENT' ? 'available' : 'unavailable' }
  }
}

function registerAppInfoIpc(ipcMain, window, app, dataDirectory) {
  ipcMain.handle('system:app-info', async (event) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Origen no autorizado.')
    }
    return { version: app.getVersion(), ...await readBackupInfo(dataDirectory) }
  })
}

module.exports = { registerAppInfoIpc, readBackupInfo }
