const { existsSync } = require('node:fs')
const path = require('node:path')

module.exports = async () => {
  const root = path.resolve(__dirname, '../..')
  const required = [
    'frontend/dist/index.html',
    'backend/target/appbarpos-backend-runtime.jar',
    'installer/runtime/bin/java.exe',
    'installer/runtime/lib/modules',
    'installer/runtime/release',
  ]
  const missing = required.filter((entry) => !existsSync(path.join(root, entry)))
  if (missing.length) {
    throw new Error('No se puede distribuir un paquete incompleto. Faltan: ' + missing.join(', ') +
      '. Consulta installer/README.md; el runtime Java no se descarga ni se genera automáticamente.')
  }
}
