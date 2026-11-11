const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const root = mkdtempSync(path.join(tmpdir(), 'AppBarPOS-auth-smoke-'))
writeFileSync(path.join(root, '.allow-auth-smoke'), 'appbarpos-auth-smoke-v1')
console.log('ISOLATED_SMOKE_DATA=' + root)
const child = spawn(process.execPath, [path.join(__dirname, 'start.cjs')], {
  env: { ...process.env, APPBARPOS_DATA_DIR: root, APPBARPOS_SMOKE_TEST: '1' },
  stdio: 'inherit', windowsHide: true,
})
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
