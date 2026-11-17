const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { startRecoveryMailTestServer } = require('./recovery-mail-test-server.cjs')

const root = mkdtempSync(path.join(tmpdir(), 'AppBarPOS-auth-smoke-'))
writeFileSync(path.join(root, '.allow-auth-smoke'), 'appbarpos-auth-smoke-v1')
console.log('ISOLATED_SMOKE_DATA=' + root)
async function run() {
const mail = await startRecoveryMailTestServer(root)
const mailConfiguration = JSON.stringify({ spring: { mail: {
  host: '127.0.0.1', port: mail.port, username: '', password: '',
  properties: { 'mail.smtp.auth': false, 'mail.smtp.starttls.enable': false, 'mail.smtp.starttls.required': false },
} }, appbarpos: { mail: { from: 'sender@example.com' } } })
const child = spawn(process.execPath, [path.join(__dirname, 'start.cjs')], {
  env: { ...process.env, APPBARPOS_DATA_DIR: root, APPBARPOS_SMOKE_TEST: '1',
    APPBARPOS_SMTP_HOST: '', APPBARPOS_SMTP_FROM: '', APPBARPOS_SMTP_USERNAME: '', APPBARPOS_SMTP_PASSWORD: '',
    SPRING_APPLICATION_JSON: mailConfiguration },
  stdio: 'inherit', windowsHide: true,
})
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; mail.close() })
child.on('exit', (code) => { process.exitCode = code ?? 1; mail.close() })
}
run().catch(error => { console.error(error.message); process.exitCode = 1 })
