const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { randomBytes } = require('node:crypto')
const { existsSync, mkdtempSync, copyFileSync, unlinkSync, rmdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

async function startBackend({ packaged, resourcesPath, dataDirectory }) {
  const jar = packaged
    ? path.join(resourcesPath, 'backend', 'appbarpos-backend.jar')
    : path.resolve(__dirname, '../../backend/target/appbarpos-backend-runtime.jar')
  const java = packaged
    ? path.join(resourcesPath, 'runtime', 'bin', 'java.exe')
    : process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe') : 'java'
  if (!existsSync(jar)) throw new Error('Falta compilar el backend. Ejecuta .\\mvnw.cmd verify en backend/.')
  if (packaged && !existsSync(java)) throw new Error('El paquete no contiene el runtime Java requerido.')
  let runtimeDirectory
  let executableJar = jar
  const cleanRuntimeCopy = () => {
    if (!runtimeDirectory) return
    try { unlinkSync(executableJar); rmdirSync(runtimeDirectory); runtimeDirectory = undefined }
    catch { console.warn('[AppBarPOS] La copia temporal de Java se conserva hasta poder liberarla.') }
  }
  if (!packaged) {
    runtimeDirectory = mkdtempSync(path.join(tmpdir(), 'AppBarPOS-runtime-'))
    executableJar = path.join(runtimeDirectory, 'backend.jar')
    try { copyFileSync(jar, executableJar) } catch (error) { cleanRuntimeCopy(); throw error }
  }
  const token = randomBytes(32).toString('hex')
  const child = spawn(java, ['--enable-native-access=ALL-UNNAMED', '-jar', executableJar], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      APPBARPOS_PORT: '0',
      APPBARPOS_API_TOKEN: token,
      APPBARPOS_DATA_DIR: dataDirectory,
    },
  })
  child.once('exit', cleanRuntimeCopy)
  child.once('error', cleanRuntimeCopy)
  let expectedExit = false
  let exitError
  const unexpectedExit = new Promise((_, reject) => { exitError = reject })
  // Registrar de inmediato para evitar rechazos sin observador durante el arranque.
  unexpectedExit.catch(() => {})
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('El backend no estuvo disponible en 60 segundos. Consulta logs/backend.log.'))
    }, 60000)
    child.once('error', (error) => { clearTimeout(timeout); reject(error) })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      const error = new Error(`El backend se detuvo (código ${code}). Consulta logs/backend.log.`)
      reject(error)
      if (!expectedExit) exitError(error)
    })
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => {
      const match = /^APPBARPOS_READY=(\d+)$/.exec(line)
      if (match) {
        clearTimeout(timeout)
        resolve(Number(match[1]))
      }
    })
  })
  const origin = `http://127.0.0.1:${port}`
  let sessionCookie = ''
  async function request(relative, method, payload, image = false) {
    const response = await fetch(origin + relative, {
      method,
      headers: {
        'X-AppBarPOS-Token': token,
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(20000),
    })
    for (const cookie of response.headers.getSetCookie()) {
      if (cookie.startsWith('APPBARPOS_SESSION=')) sessionCookie = cookie.split(';')[0]
    }
    const body = response.status === 204 ? null : image && response.ok
      ? 'data:image/png;base64,' + Buffer.from(await response.arrayBuffer()).toString('base64')
      : await response.json()
    return { ok: response.ok, status: response.status, body }
  }
  return {
    unexpectedExit,
    async health() {
      const response = await fetch(`${origin}/api/system/health`, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error('La base de datos local no está disponible.')
      return response.json()
    },
    async auth(operation, payload) {
      const paths = {
        session: '/api/auth/session', setup: '/api/auth/setup', login: '/api/auth/login',
        logout: '/api/auth/logout', credentials: '/api/auth/credentials',
      }
      if (!Object.hasOwn(paths, operation)) throw new Error('Operación no permitida.')
      const response = await request(paths[operation], operation === 'session' ? 'GET' : 'POST', payload)
      if (response.ok && (operation === 'logout' || operation === 'credentials')) sessionCookie = ''
      return response
    },
    async catalog(operation, payload) {
      if (operation === 'list') return request('/api/products', 'GET')
      if (operation === 'create') return request('/api/products', 'POST', payload)
      if (!['update', 'status', 'image'].includes(operation) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(payload?.id || '')) {
        throw new Error('Operación de catálogo no permitida.')
      }
      const { id, ...body } = payload
      const relative = `/api/products/${id}`
      if (operation === 'image') return request(relative + '/image', 'GET', undefined, true)
      return request(relative + (operation === 'status' ? '/status' : ''), operation === 'status' ? 'POST' : 'PUT', body)
    },
    async stop() {
      expectedExit = true
      if (child.exitCode !== null) return
      const exited = new Promise((resolve) => child.once('exit', resolve))
      try {
        await fetch(`${origin}/api/system/shutdown`, {
          method: 'POST',
          headers: { 'X-AppBarPOS-Token': token },
          signal: AbortSignal.timeout(2000),
        })
      } catch { /* Aplicar límite de cierre aun si el servicio dejó de responder. */ }
      let timer
      await Promise.race([
        exited,
        new Promise((resolve) => { timer = setTimeout(() => { child.kill(); resolve() }, 12000) }),
      ])
      clearTimeout(timer)
    },
  }
}

module.exports = { startBackend }
