const { readFileSync } = require('node:fs')
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
  const pin = String(randomInt(100000, 999999))
  const nextPin = pin === '000000' ? '111111' : '000000'
  async function evaluate(source) { return window.webContents.executeJavaScript(source) }
  async function waitFor(expression) {
    await evaluate(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 15000;
      const timer = setInterval(() => {
        if (${expression}) { clearInterval(timer); resolve(true); }
        else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('La interfaz no alcanzó el estado esperado.')); }
      }, 100);
    })`)
  }
  async function fill(id, value) {
    await evaluate(`(() => {
      const input = document.getElementById(${JSON.stringify(id)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
  }
  async function submit() { await evaluate("document.querySelector('form').requestSubmit()") }
  await waitFor("document.getElementById('access-confirmation')")
  await fill('access-username', username)
  await fill('access-pin', pin)
  await fill('access-confirmation', pin)
  await submit()
  await waitFor("document.getElementById('logout')")
  const initial = await backend.auth('session')
  if (!initial.body.authenticated || initial.body.username !== username) throw new Error('Falló el alta por formulario.')
  await runCatalogSmoke(window, backend, { evaluate, waitFor, fill, submit })
  await evaluate("document.getElementById('security-navigation').click()")
  await waitFor("document.getElementById('security-current-pin')")
  await fill('security-current-pin', pin)
  await fill('security-username', username + '-updated')
  await fill('security-pin', nextPin)
  await fill('security-confirmation', nextPin)
  await submit()
  await waitFor("document.getElementById('confirm-credentials')")
  await evaluate("document.getElementById('confirm-credentials').click()")
  await waitFor("document.getElementById('access-pin')")
  if ((await backend.auth('session')).body.authenticated) throw new Error('No se revocó la sesión al cambiar el PIN.')
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
  // Verificar al final: ocultar una ventana ya mostrada puede suspender capturePage.
  window.showInactive()
  if (!window.isVisible()) throw new Error('La ventana nativa no se mostró.')
  window.hide()
  console.log('APPBARPOS_WINDOW_VISIBILITY=true')
  console.log('APPBARPOS_AUTH_SMOKE=setup,credentials,relogin,logout:OK')
  console.log('APPBARPOS_RENDER_SMOKE=true')
}

module.exports = { runSmoke }
