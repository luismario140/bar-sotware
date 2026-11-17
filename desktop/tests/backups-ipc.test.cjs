const test = require('node:test')
const assert = require('node:assert/strict')
const { registerBackupsIpc } = require('../src/backups-ipc.cjs')

function fixture(authenticated = true) {
  let invoke
  const webContents = { mainFrame: {} }
  const calls = []
  registerBackupsIpc({ handle: (_, handler) => { invoke = handler } }, { webContents }, {
    dataDirectory: 'C:/AppBarPOS-test-only',
    backend: {
      auth: async () => ({ ok: true, body: { authenticated } }),
      backups: async operation => { calls.push(operation); return { ok: false, status: 401, body: { code: 'INVALID_CREDENTIALS' } } },
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { openPath: async () => '' },
    restore: async () => { calls.push('activate'); return { ok: true } },
  })
  return { invoke, calls, event: { sender: webContents, senderFrame: webContents.mainFrame } }
}

test('solo permite el origen principal y operaciones de la interfaz autorizadas', async () => {
  const { invoke, event, calls } = fixture()
  await assert.rejects(invoke({ sender: {}, senderFrame: {} }, 'create'), /Origen no autorizado/)
  await assert.rejects(invoke(event, 'inspect', { path: 'private-file.zip' }), /Operación no permitida/)
  await assert.rejects(invoke(event, 'chooseRestore', { path: 'private-file.zip' }), /Datos de respaldo inválidos/)
  assert.deepEqual(calls, [])
})

test('requiere sesión antes de abrir un archivo o restaurar', async () => {
  const { invoke, event, calls } = fixture(false)
  const reply = await invoke(event, 'chooseRestore')
  assert.equal(reply.status, 401)
  assert.equal(reply.body.code, 'UNAUTHENTICATED')
  assert.deepEqual(calls, [])
})

test('cancelar el selector no prepara ni restaura archivos', async () => {
  const { invoke, event, calls } = fixture()
  const reply = await invoke(event, 'chooseRestore')
  assert.equal(reply.ok, true)
  assert.equal(reply.body, null)
  assert.deepEqual(calls, [])
})

test('no activa una restauración sin PIN válido ni exporta rutas arbitrarias', async () => {
  const { invoke, event, calls } = fixture()
  const id = '12345678-1234-1234-1234-123456789abc'
  assert.equal((await invoke(event, 'restore', { id, currentPin: '12345' })).status, 400)
  assert.equal((await invoke(event, 'restore', { id, currentPin: '0012' })).status, 401)
  assert.equal((await invoke(event, 'export', { filename: '../data/bar.db' })).ok, false)
  assert.deepEqual(calls, ['prepareRestore'])
})
