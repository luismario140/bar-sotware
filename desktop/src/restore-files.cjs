const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const validId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function within(root, target) {
  const resolved = path.resolve(target)
  const relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Ruta de restauración inválida.')
  return resolved
}
async function exists(target) { try { await fs.lstat(target); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
async function directory(root, target) {
  const resolved = within(root, target)
  for (let current = resolved; current !== root; current = path.dirname(current)) {
    const info = await fs.lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('La restauración no admite enlaces ni carpetas inválidas.')
  }
  return resolved
}

// Solo se llama con Java detenido. Los directorios completos incluyen cualquier WAL/SHM anterior.
async function activateRestore(dataDirectory, id) {
  if (!validId.test(id)) throw new Error('Identificador de restauración inválido.')
  const root = await fs.realpath(dataDirectory)
  const backups = await directory(root, path.join(root, 'backups'))
  const staging = await directory(root, path.join(backups, '.restore-' + id))
  const previous = within(root, path.join(backups, '.previous-' + id))
  const journal = within(root, path.join(backups, '.restore-journal.json'))
  if (await exists(journal)) throw new Error('Hay una restauración pendiente de recuperación.')
  for (const name of ['data', 'media']) { await directory(root, path.join(root, name)); await directory(root, path.join(staging, name)) }
  await fs.mkdir(previous)
  await fs.writeFile(journal, JSON.stringify({ id }), { flag: 'wx', flush: true })
  try {
    for (const name of ['data', 'media']) await fs.rename(within(root, path.join(root, name)), within(root, path.join(previous, name)))
    for (const name of ['data', 'media']) await fs.rename(within(root, path.join(staging, name)), within(root, path.join(root, name)))
  } catch (error) { await recoverInterruptedRestore(root); throw error }
  return {
    async commit() { await fs.unlink(journal) },
    async rollback() { await recoverInterruptedRestore(root) },
  }
}

async function recoverInterruptedRestore(dataDirectory) {
  const requested = path.resolve(dataDirectory)
  if (!await exists(requested)) return false
  const root = await fs.realpath(requested)
  const journal = within(root, path.join(root, 'backups', '.restore-journal.json'))
  if (!await exists(journal)) return false
  await directory(root, path.dirname(journal))
  const info = await fs.lstat(journal)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) throw new Error('Registro de restauración inválido.')
  const { id } = JSON.parse(await fs.readFile(journal, 'utf8'))
  if (!validId.test(id)) throw new Error('Registro de restauración inválido.')
  const previous = await directory(root, path.join(root, 'backups', '.previous-' + id))
  const failed = within(root, path.join(root, 'backups', '.interrupted-' + id + '-' + randomUUID()))
  await fs.mkdir(failed)
  for (const name of ['data', 'media']) {
    const original = within(root, path.join(previous, name))
    if (!await exists(original)) continue
    await directory(root, original)
    const current = within(root, path.join(root, name))
    if (await exists(current)) { await directory(root, current); await fs.rename(current, within(root, path.join(failed, name))) }
    await fs.rename(original, current)
  }
  await fs.unlink(journal)
  return true
}

module.exports = { activateRestore, recoverInterruptedRestore }
