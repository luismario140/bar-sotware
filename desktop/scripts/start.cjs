const { spawn } = require('node:child_process')
const electron = require('electron')

// Algunas herramientas de desarrollo heredan esta variable para sus propios procesos.
// La ventana de AppBarPOS debe ejecutar Electron, no su modo compatible con Node.
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
console.info('[AppBarPOS] Abriendo la aplicación de escritorio...')
const child = spawn(electron, ['.'], {
  cwd: require('node:path').resolve(__dirname, '..'),
  env: environment,
  stdio: 'inherit',
  // Electron es la interfaz visible, no un servicio auxiliar como Java.
  windowsHide: false,
})
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { if (child.exitCode === null) child.kill(signal) })
}
