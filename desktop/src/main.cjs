const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const { startBackend } = require('./backend.cjs')
const { registerAuthIpc } = require('./auth-ipc.cjs')
const { registerCatalogIpc } = require('./catalog-ipc.cjs')
const { registerAppInfoIpc } = require('./app-info.cjs')
const { registerBackupsIpc } = require('./backups-ipc.cjs')
const { activateRestore, recoverInterruptedRestore } = require('./restore-files.cjs')
const { runSmoke, createSmokeDialogs } = require('./smoke.cjs')
const { mkdirSync, readFileSync } = require('node:fs')

let backend
let mainWindow
let quitting = false
let restoring = false
const frontend = path.resolve(__dirname, '../renderer/index.html')
const developmentFrontend = path.resolve(__dirname, '../../frontend/dist/index.html')
const smoke = !app.isPackaged && process.env.APPBARPOS_SMOKE_TEST === '1'

// Una prueba no debe reutilizar o enfocar la instancia real del administrador.
if (smoke) {
  const root = process.env.APPBARPOS_DATA_DIR
  if (!root || readFileSync(path.join(root, '.allow-auth-smoke'), 'utf8') !== 'appbarpos-auth-smoke-v1') {
    throw new Error('La prueba requiere datos aislados. Usa npm run smoke.')
  }
  const profile = path.join(root, 'electron-test-profile')
  mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
}

function showMainWindow() {
  const window = mainWindow || BrowserWindow.getAllWindows()[0]
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

if (!app.requestSingleInstanceLock()) {
  console.info('[AppBarPOS] La aplicación ya está abierta. Recuperando su ventana...')
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
  app.whenReady().then(async () => {
    const localAppData = process.env.LOCALAPPDATA
    if (process.platform === 'win32' && !localAppData) throw new Error('No se encontró LOCALAPPDATA.')
    const dataDirectory = process.env.APPBARPOS_DATA_DIR || (localAppData
      ? path.join(localAppData, 'BarSoftware')
      : path.join(app.getPath('home'), '.local', 'share', 'BarSoftware'))
    console.info('[AppBarPOS] Iniciando el servicio local...')
    await recoverInterruptedRestore(dataDirectory)
    async function bootBackend() {
      const service = await startBackend({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, dataDirectory })
      service.unexpectedExit.catch((error) => {
        if (!quitting && !restoring) { dialog.showErrorBox('AppBarPOS · Servicio detenido', error.message); app.quit() }
      })
      return service
    }
    backend = await bootBackend()
    console.info('[AppBarPOS] Servicio local disponible. Cargando la ventana...')
    const window = new BrowserWindow({
      width: 1280, height: 850, minWidth: 800, minHeight: 650,
      backgroundColor: '#10141c', autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true,
      },
    })
    mainWindow = window
    window.on('close', event => { if (restoring) event.preventDefault() })
    window.on('closed', () => { mainWindow = null })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    ipcMain.handle('system:health', (event) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
        throw new Error('Origen no autorizado.')
      }
      return backend.health()
    })
    const api = Object.fromEntries(['auth', 'catalog', 'backups', 'health'].map(method => [method, (...args) => backend[method](...args)]))
    registerAuthIpc(ipcMain, window, api)
    registerCatalogIpc(ipcMain, window, api)
    registerAppInfoIpc(ipcMain, window, app, dataDirectory)
    registerBackupsIpc(ipcMain, window, { backend: api, dataDirectory,
      dialog: smoke ? createSmokeDialogs(dataDirectory) : dialog,
      shell: smoke ? { openPath: async () => '' } : shell,
      async restore(id) {
        restoring = true
        let transaction
        let stopped = false
        try {
          await backend.stop(); stopped = true
          transaction = await activateRestore(dataDirectory, id)
          backend = await bootBackend()
          await transaction.commit()
          setTimeout(() => { if (!window.isDestroyed()) window.webContents.reload() }, 200)
          return { ok: true, status: 200, body: { restored: true } }
        } catch {
          try {
            if (stopped) {
              await backend.stop()
              if (transaction) await transaction.rollback()
              else await recoverInterruptedRestore(dataDirectory)
              backend = await bootBackend()
              setTimeout(() => { if (!window.isDestroyed()) window.webContents.reload() }, 1000)
            } else await backend.backups('cancelRestore')
            return { ok: false, status: 503, body: { code: 'RESTORE_FAILED', message: 'No se pudo restaurar el respaldo. Se conservaron los datos anteriores.' } }
          } catch {
            dialog.showErrorBox('AppBarPOS · Restauración interrumpida', 'No se pudo reiniciar el servicio. Las copias de seguridad y los datos anteriores se conservaron. Cierra la aplicación y contacta con Mario Dev antes de continuar.')
            quitting = true
            try { await backend.stop() } finally { app.exit(1) }
          }
        } finally { restoring = false }
      },
    })
    await window.loadFile(app.isPackaged ? frontend : developmentFrontend)
    if (!smoke) {
      showMainWindow()
      console.info('[AppBarPOS] Ventana lista. La consola permanece abierta mientras usas la aplicación.')
    }
    // Verificación técnica explícita, disponible solamente fuera del paquete distribuido.
    if (!app.isPackaged && process.env.APPBARPOS_SMOKE_TEST === '1') {
      await runSmoke(window, api, dataDirectory)
      app.quit()
    }
  }).catch(async (error) => {
    console.error(error.message)
    if (process.env.APPBARPOS_SMOKE_TEST !== '1') dialog.showErrorBox('AppBarPOS · Error de inicio', error.message)
    quitting = true
    if (backend) await backend.stop()
    app.exit(1)
  })
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', (event) => {
  if (restoring) { event.preventDefault(); return }
  if (!backend || quitting) return
  event.preventDefault()
  quitting = true
  backend.stop().finally(() => app.quit())
})
