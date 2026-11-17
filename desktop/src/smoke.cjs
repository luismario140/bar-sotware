const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { randomInt } = require('node:crypto')
const path = require('node:path')
const { runCatalogSmoke } = require('./catalog-smoke.cjs')

async function runSmoke(window, backend, dataDirectory) {
  // Nunca configurar o modificar un administrador del directorio real por un flag heredado.
  if (!process.env.APPBARPOS_DATA_DIR ||
      readFileSync(path.join(dataDirectory, '.allow-auth-smoke'), 'utf8') !== 'appbarpos-auth-smoke-v1') {
    throw new Error('La prueba requiere datos aislados. Usa npm run smoke.')
  }
  const state = await backend.auth('session')
  if (!state.ok || state.body.configured) throw new Error('La prueba requiere una base sin administrador.')
  const username = 'test-' + randomInt(100000, 999999)
  const pin = String(randomInt(1000, 9999))
  const nextPin = '0000'
  async function evaluate(source) { return window.webContents.executeJavaScript(source) }
  async function waitFor(expression, timeout = 15000) {
    await evaluate(`new Promise((resolve, reject) => {
      const deadline = Date.now() + ${timeout};
      const timer = setInterval(() => {
        if (${expression}) { clearInterval(timer); resolve(true); }
        else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('La interfaz no alcanzó el estado esperado: ' + ${JSON.stringify(expression)})); }
      }, 100);
    })`)
  }
  async function waitForReload(expression) {
    const deadline = Date.now() + 90000
    while (Date.now() < deadline) {
      try { if (await evaluate(`Boolean(${expression})`)) return } catch { /* El contexto anterior desaparece durante la recarga. */ }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('La aplicacion no regreso al login despues de restaurar.')
  }
  async function fill(id, value) {
    await evaluate(`(() => {
      const input = document.getElementById(${JSON.stringify(id)});
      const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    })()`)
  }
  async function submit() { await evaluate("document.querySelector('form').requestSubmit()") }
  await waitFor("document.getElementById('access-confirmation')")
  await fill('access-pin', 'a01b2345')
  if (!await evaluate("document.getElementById('access-pin').value === '0123' && document.querySelectorAll('.pin-slots')[0].children.length === 4")) throw new Error('El PIN debe aceptar solo cuatro dígitos y conservar los ceros iniciales.')
  await fill('access-username', username)
  await fill('access-email', 'admin@example.com')
  await fill('access-pin', pin)
  await fill('access-confirmation', pin)
  await submit()
  await waitFor("document.getElementById('logout')")
  await waitFor("document.querySelector('.footer-version').textContent.includes('v') && document.querySelector('.footer-credit').textContent.includes('Mario Dev') && !document.querySelector('.footer-backup').textContent.includes('Consultando')")
  const applicationInfo = await evaluate('window.appbarpos.appInfo()')
  if (applicationInfo.version !== require('../package.json').version || applicationInfo.backupStatus !== 'available') throw new Error('El footer no recibe la versión del programa o el estado de los respaldos.')
  const initial = await backend.auth('session')
  if (!initial.body.authenticated || initial.body.username !== username) throw new Error('Falló el alta por formulario.')
  await runCatalogSmoke(window, backend, { evaluate, waitFor, fill, submit })
  await evaluate("document.getElementById('security-navigation').click()")
  await waitFor("document.getElementById('edit-credentials') && !document.getElementById('create-backup').disabled")
  if (await evaluate("!!document.getElementById('security-current-pin')")) throw new Error('El formulario de acceso debe permanecer cerrado hasta elegir la opcion.')
  await evaluate("document.getElementById('create-backup').click()")
  await waitFor("document.querySelector('[data-backup-file]') && !document.getElementById('create-backup').disabled")
  await waitFor("document.querySelector('.footer-backup time')")
  const savedBackup = (await backend.backups('list')).body.find(file => file.kind === 'manual')
  const snapshotProducts = JSON.stringify((await backend.catalog('list')).body)
  const snapshotSales = JSON.stringify((await backend.catalog('sales', { page: 0 })).body)
  const snapshotAccounts = JSON.stringify((await backend.catalog('accounts')).body)
  const exportedBackup = path.join(dataDirectory, 'exported-backup.zip')
  const dialogChoice = path.join(dataDirectory, '.backup-dialog-choice.json')
  writeFileSync(dialogChoice, JSON.stringify({ save: exportedBackup }))
  await evaluate("document.querySelector('[data-backup-file] button').click()")
  await waitFor("!document.getElementById('create-backup').disabled && document.querySelector('.backup-panel .form-success')?.textContent.includes('Copia guardada')")
  if (!readFileSync(exportedBackup).equals(readFileSync(path.join(dataDirectory, 'backups', savedBackup.filename)))) throw new Error('La copia exportada difiere del respaldo local.')
  const invalidBackup = path.join(dataDirectory, 'invalid-backup.zip')
  writeFileSync(invalidBackup, 'invalid zip')
  writeFileSync(dialogChoice, JSON.stringify({ open: invalidBackup }))
  await evaluate("document.getElementById('choose-backup').click()")
  await waitFor("document.querySelector('.backup-panel [role=alert]')")
  if (JSON.stringify((await backend.catalog('list')).body) !== snapshotProducts) throw new Error('Un respaldo invalido modifico el inventario.')
  writeFileSync(dialogChoice, JSON.stringify({ open: exportedBackup }))
  await evaluate("document.getElementById('choose-backup').click()")
  await waitFor("document.getElementById('restore-current-pin')")
  await evaluate("document.querySelector('dialog .dialog-actions .secondary-button').click()")
  await waitFor("!document.querySelector('dialog[open]') && !document.getElementById('edit-credentials').disabled")
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  writeFileSync(path.join(dataDirectory, 'security-preview.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
  await evaluate("document.getElementById('edit-credentials').click()")
  await waitFor("document.getElementById('security-current-pin')")
  if (!await evaluate("!!document.querySelector('dialog[open] #security-current-pin') && !!document.getElementById('security-guidelines-title')")) throw new Error('El formulario de acceso debe abrirse como una opcion independiente.')
  await fill('security-current-pin', '012345')
  if (!await evaluate("document.getElementById('security-current-pin').value === '0123'")) throw new Error('El PIN actual debe limitarse a cuatro dígitos.')
  await fill('security-current-pin', pin)
  await fill('security-username', username + '-updated')
  await fill('security-pin', nextPin)
  await fill('security-confirmation', nextPin)
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  writeFileSync(path.join(dataDirectory, 'credentials-preview.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
  await submit()
  await waitFor("document.getElementById('confirm-credentials')")
  await evaluate("document.getElementById('confirm-credentials').click()")
  await waitFor("document.getElementById('access-pin')")
  if ((await backend.auth('session')).body.authenticated) throw new Error('No se revocó la sesión al cambiar el PIN.')
  writeFileSync(path.join(dataDirectory, 'login-preview.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
  await fill('access-username', username + '-updated')
  await fill('access-pin', pin)
  await submit()
  await waitFor("document.querySelector('[role=alert]')")
  if (await evaluate("document.getElementById('access-pin').value !== ''")) throw new Error('El PIN quedó en el formulario tras un intento fallido.')
  await fill('access-pin', nextPin)
  await submit()
  await waitFor("document.getElementById('logout')")
  await evaluate("document.getElementById('system-navigation').click()")
  await waitFor("document.body.innerText.includes('El backend y la base de datos responden correctamente.')")
  const health = await backend.health()
  if (health.status !== 'UP') throw new Error('Falló el diagnóstico SQLite.')
  await evaluate("document.getElementById('logout').click()")
  await waitFor("document.getElementById('access-pin')")
  if ((await backend.auth('session')).body.authenticated) throw new Error('Logout no revocó la sesión.')
  await evaluate("document.getElementById('recover-access').click()")
  await waitFor("document.getElementById('recovery-email')")
  await fill('recovery-email', 'admin@example.com')
  await submit()
  await waitFor("document.getElementById('recovery-code')")
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  writeFileSync(path.join(dataDirectory, 'recovery-preview.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG())
  const mailbox = path.join(dataDirectory, 'test-recovery-mail.json')
  const deadline = Date.now() + 15000
  while (!existsSync(mailbox) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
  if (!existsSync(mailbox)) throw new Error('No llegó el código al servidor SMTP de pruebas.')
  const recoveryCode = JSON.parse(readFileSync(mailbox, 'utf8')).code
  await fill('recovery-code', recoveryCode === '99999999' ? '00000000' : '99999999')
  await fill('recovery-pin', '0123')
  await fill('recovery-confirmation', '0123')
  await submit()
  await waitFor("document.querySelector('[role=alert]')")
  await fill('recovery-code', recoveryCode)
  await fill('recovery-pin', '0123')
  await fill('recovery-confirmation', '0123')
  await submit()
  await waitFor("document.getElementById('access-pin')")
  await fill('access-username', username + '-updated')
  await fill('access-pin', '0123')
  await submit()
  await waitFor("document.getElementById('logout')")
  const replay = await backend.auth('recovery-reset', { email: 'admin@example.com', code: recoveryCode, pin: '1234' })
  if (replay.ok) throw new Error('El código de recuperación se pudo reutilizar.')
  const currentProduct = (await backend.catalog('list')).body[0]
  if (!(await backend.catalog('restock', { id: currentProduct.id, expectedVersion: currentProduct.version, operationId: require('node:crypto').randomUUID(), quantity: 1 })).ok) throw new Error('No se pudo preparar el cambio posterior al respaldo.')
  await evaluate("document.getElementById('security-navigation').click()")
  await waitFor("document.getElementById('choose-backup') && !document.getElementById('choose-backup').disabled")
  writeFileSync(dialogChoice, JSON.stringify({ open: exportedBackup }))
  await evaluate("document.getElementById('choose-backup').click()")
  await waitFor("document.getElementById('restore-current-pin')")
  await fill('restore-current-pin', '9999')
  await submit()
  await waitFor("document.querySelector('dialog [role=alert]')")
  if (JSON.stringify((await backend.catalog('list')).body) === snapshotProducts) throw new Error('Un PIN incorrecto activo la restauracion.')
  await fill('restore-current-pin', '0123')
  await submit()
  await waitForReload("document.getElementById('access-pin') && !document.getElementById('logout')")
  await fill('access-username', username)
  await fill('access-pin', pin)
  await submit()
  await waitFor("document.getElementById('logout')")
  if (JSON.stringify((await backend.catalog('list')).body) !== snapshotProducts || JSON.stringify((await backend.catalog('sales', { page: 0 })).body) !== snapshotSales || JSON.stringify((await backend.catalog('accounts')).body) !== snapshotAccounts) throw new Error('La restauracion no recupero inventario, ventas y cuentas del respaldo.')
  if (!(await backend.backups('list')).body.some(file => file.kind === 'pre-restore')) throw new Error('La restauracion no dejo una copia del estado anterior.')
  await evaluate("document.getElementById('logout').click()")
  await waitFor("document.getElementById('access-pin')")
  // Verificar al final: ocultar una ventana ya mostrada puede suspender capturePage.
  window.showInactive()
  if (!window.isVisible()) throw new Error('La ventana nativa no se mostró.')
  window.hide()
  console.log('APPBARPOS_WINDOW_VISIBILITY=true')
  console.log('APPBARPOS_AUTH_SMOKE=setup,credentials,relogin,logout,recovery-smtp,reset,single-use:OK')
  console.log('APPBARPOS_BACKUP_SMOKE=create,footer,export,invalid-zip,cancel,pin-required,restore,restart,inventory,sales,accounts:OK')
  console.log('APPBARPOS_RENDER_SMOKE=true')
}

function createSmokeDialogs(root) {
  if (readFileSync(path.join(root, '.allow-auth-smoke'), 'utf8') !== 'appbarpos-auth-smoke-v1') throw new Error('Los dialogos de prueba requieren datos aislados.')
  function selection(kind) {
    const chosen = JSON.parse(readFileSync(path.join(root, '.backup-dialog-choice.json'), 'utf8'))[kind]
    if (!chosen) return null
    const relative = path.relative(path.resolve(root), path.resolve(chosen))
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('La prueba no puede usar archivos fuera de sus datos aislados.')
    return chosen
  }
  return {
    async showOpenDialog() { const chosen = selection('open'); return { canceled: !chosen, filePaths: chosen ? [chosen] : [] } },
    async showSaveDialog() { const chosen = selection('save'); return { canceled: !chosen, filePath: chosen } },
  }
}

module.exports = { runSmoke, createSmokeDialogs }
