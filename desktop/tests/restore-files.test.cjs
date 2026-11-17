const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { activateRestore, recoverInterruptedRestore } = require('../src/restore-files.cjs')

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'AppBarPOS-restore-test-'))
  const id = randomUUID()
  const staging = path.join(root, 'backups', '.restore-' + id)
  for (const directory of ['data', 'media', 'backups', path.relative(root, path.join(staging, 'data')), path.relative(root, path.join(staging, 'media'))]) await fs.mkdir(path.join(root, directory), { recursive: true })
  await fs.writeFile(path.join(root, 'data', 'bar.db'), 'current-database')
  await fs.writeFile(path.join(root, 'data', 'bar.db-wal'), 'current-wal')
  await fs.writeFile(path.join(root, 'media', 'current.png'), 'current-image')
  await fs.writeFile(path.join(staging, 'data', 'bar.db'), 'backup-database')
  await fs.writeFile(path.join(staging, 'media', 'backup.png'), 'backup-image')
  t.after(async () => {
    const relative = path.relative(os.tmpdir(), root)
    assert.ok(relative.startsWith('AppBarPOS-restore-test-') && !relative.includes(path.sep))
    await fs.rm(root, { recursive: true, force: true })
  })
  return { root, id, staging }
}

test('restaura base e imágenes juntas y conserva la base y WAL anteriores', async t => {
  const { root, id } = await fixture(t)
  const transaction = await activateRestore(root, id)
  assert.equal(await fs.readFile(path.join(root, 'data', 'bar.db'), 'utf8'), 'backup-database')
  assert.equal(await fs.readFile(path.join(root, 'media', 'backup.png'), 'utf8'), 'backup-image')
  await assert.rejects(fs.stat(path.join(root, 'data', 'bar.db-wal')), { code: 'ENOENT' })
  assert.equal(await fs.readFile(path.join(root, 'backups', '.previous-' + id, 'data', 'bar.db-wal'), 'utf8'), 'current-wal')
  await transaction.commit()
  assert.equal(await recoverInterruptedRestore(root), false)
})

test('revierte la restauración si el nuevo servicio no inicia', async t => {
  const { root, id } = await fixture(t)
  const transaction = await activateRestore(root, id)
  await transaction.rollback()
  assert.equal(await fs.readFile(path.join(root, 'data', 'bar.db'), 'utf8'), 'current-database')
  assert.equal(await fs.readFile(path.join(root, 'data', 'bar.db-wal'), 'utf8'), 'current-wal')
  assert.equal(await fs.readFile(path.join(root, 'media', 'current.png'), 'utf8'), 'current-image')
})

test('recupera una interrupción entre el cambio de carpetas y la confirmación', async t => {
  const { root, id } = await fixture(t)
  await activateRestore(root, id)
  assert.equal(await recoverInterruptedRestore(root), true)
  assert.equal(await fs.readFile(path.join(root, 'data', 'bar.db'), 'utf8'), 'current-database')
  assert.equal(await recoverInterruptedRestore(root), false)
})

test('recupera una interrupción que solo alcanzó a mover la base anterior', async t => {
  const { root, id } = await fixture(t)
  const previous = path.join(root, 'backups', '.previous-' + id)
  await fs.mkdir(previous)
  await fs.writeFile(path.join(root, 'backups', '.restore-journal.json'), JSON.stringify({ id }))
  await fs.rename(path.join(root, 'data'), path.join(previous, 'data'))
  await recoverInterruptedRestore(root)
  assert.equal(await fs.readFile(path.join(root, 'data', 'bar.db'), 'utf8'), 'current-database')
  assert.equal(await fs.readFile(path.join(root, 'media', 'current.png'), 'utf8'), 'current-image')
})

test('rechaza rutas ajenas y preparaciones incompletas antes de mover datos', async t => {
  const { root } = await fixture(t)
  await assert.rejects(activateRestore(root, '../../outside'))
  await assert.rejects(activateRestore(root, randomUUID()))
  assert.equal(await fs.readFile(path.join(root, 'data', 'bar.db'), 'utf8'), 'current-database')
  await fs.writeFile(path.join(root, 'backups', '.restore-journal.json'), JSON.stringify({ id: '../../outside' }))
  await assert.rejects(recoverInterruptedRestore(root))
  assert.equal(await fs.readFile(path.join(root, 'data', 'bar.db'), 'utf8'), 'current-database')
})
