const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { readBackupInfo, registerAppInfoIpc } = require('../src/app-info.cjs')

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'AppBarPOS-footer-test-'))
  t.after(async () => {
    const relative = path.relative(os.tmpdir(), root)
    assert.ok(relative.startsWith('AppBarPOS-footer-test-') && !relative.includes(path.sep))
    await rm(root, { recursive: true, force: true })
  })
  return root
}

const name = (timestamp) => `pre-migration-${timestamp}-12345678-1234-1234-1234-123456789abc.zip`

test('un equipo sin respaldos devuelve fecha vacía', async (t) => {
  const root = await fixture(t)
  assert.deepEqual(await readBackupInfo(root), { lastBackupAt: null, backupStatus: 'available' })
})

test('elige el último respaldo finalizado e ignora parciales y directorios', async (t) => {
  const root = await fixture(t)
  const directory = path.join(root, 'backups')
  await mkdir(directory)
  const first = Date.UTC(2026, 0, 1, 12)
  const latest = first + 60000
  await writeFile(path.join(directory, name(latest)), '')
  await writeFile(path.join(directory, name(first)), '')
  await writeFile(path.join(directory, name(latest + 60000) + '.part'), '')
  await writeFile(path.join(directory, 'otro-archivo.zip'), '')
  await mkdir(path.join(directory, name(latest + 120000)))
  assert.deepEqual(await readBackupInfo(root), { lastBackupAt: new Date(latest).toISOString(), backupStatus: 'available' })
})

test('un error al consultar se distingue de la ausencia de respaldos', async (t) => {
  const root = await fixture(t)
  await writeFile(path.join(root, 'backups'), '')
  assert.deepEqual(await readBackupInfo(root), { lastBackupAt: null, backupStatus: 'unavailable' })
})

test('incluye las copias manuales y las previas a restaurar', async (t) => {
  const root = await fixture(t)
  const directory = path.join(root, 'backups')
  await mkdir(directory)
  const timestamp = Date.UTC(2026, 0, 1, 12)
  await writeFile(path.join(directory, name(timestamp).replace('pre-migration', 'manual')), '')
  await writeFile(path.join(directory, name(timestamp + 60000).replace('pre-migration', 'pre-restore')), '')
  assert.equal((await readBackupInfo(root)).lastBackupAt, new Date(timestamp + 60000).toISOString())
})

test('el IPC devuelve la versión instalada y rechaza otros orígenes', async (t) => {
  const root = await fixture(t)
  let handler
  const webContents = { mainFrame: {} }
  registerAppInfoIpc({ handle: (channel, callback) => { assert.equal(channel, 'system:app-info'); handler = callback } }, { webContents }, { getVersion: () => '2.3.4' }, root)
  await assert.rejects(handler({ sender: {}, senderFrame: webContents.mainFrame }), /Origen no autorizado/)
  await assert.rejects(handler({ sender: webContents, senderFrame: {} }), /Origen no autorizado/)
  assert.deepEqual(await handler({ sender: webContents, senderFrame: webContents.mainFrame }), { version: '2.3.4', lastBackupAt: null, backupStatus: 'available' })
})
