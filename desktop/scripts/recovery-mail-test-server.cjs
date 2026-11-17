const net = require('node:net')
const { readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

// Solo para la prueba aislada: nunca reenvía mensajes ni escucha fuera de loopback.
async function startRecoveryMailTestServer(root) {
  if (readFileSync(path.join(root, '.allow-auth-smoke'), 'utf8') !== 'appbarpos-auth-smoke-v1') throw new Error('SMTP de pruebas requiere datos aislados.')
  const sockets = new Set()
  const server = net.createServer(socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    socket.setEncoding('utf8')
    socket.write('220 localhost AppBarPOS test SMTP\r\n')
    let pending = ''
    let data = null
    socket.on('data', chunk => {
      pending += chunk
      let end
      while ((end = pending.indexOf('\r\n')) !== -1) {
        const line = pending.slice(0, end)
        pending = pending.slice(end + 2)
        if (data !== null) {
          if (line !== '.') { data.push(line); continue }
          const body = data.join('\r\n').split('\r\n\r\n').slice(1).join('\r\n\r\n')
          const code = body.match(/\b([0-9]{8})\b/)?.[1]
          if (code) writeFileSync(path.join(root, 'test-recovery-mail.json'), JSON.stringify({ code }))
          data = null
          socket.write('250 Message accepted by test mailbox\r\n')
        } else if (/^(EHLO|HELO)\b/i.test(line)) socket.write('250 localhost\r\n')
        else if (/^MAIL FROM:/i.test(line)) socket.write('250 OK\r\n')
        else if (/^RCPT TO:<admin@example\.com>$/i.test(line)) socket.write('250 OK\r\n')
        else if (/^DATA$/i.test(line)) { data = []; socket.write('354 End with a dot\r\n') }
        else if (/^(RSET|NOOP)$/i.test(line)) socket.write('250 OK\r\n')
        else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n')
        else socket.write('550 Test command or recipient rejected\r\n')
      }
    })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return { port: server.address().port, close() { for (const socket of sockets) socket.destroy(); server.close() } }
}

module.exports = { startRecoveryMailTestServer }
