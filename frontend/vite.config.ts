import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const backendPort = Number(process.env.APPBARPOS_PORT || 8080)
if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535) {
  throw new Error('APPBARPOS_PORT debe estar entre 1 y 65535 para desarrollo web.')
}
const developmentTokenFile = fileURLToPath(new URL(`../.local/api-token-${backendPort}.txt`, import.meta.url))
const localProxy: ProxyOptions = {
  target: `http://127.0.0.1:${backendPort}`,
  changeOrigin: false,
  configure(proxy) {
    proxy.on('proxyReq', (request) => {
      // Solo en el proceso Vite: nunca usar VITE_* ni entregar el token al navegador.
      request.removeHeader('X-AppBarPOS-Token')
      if (existsSync(developmentTokenFile)) {
        request.setHeader('X-AppBarPOS-Token', readFileSync(developmentTokenFile, 'utf8').trim())
      }
    })
  },
}

export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: 'appbarpos-production-csp',
    transformIndexHtml() {
      // El servidor de desarrollo necesita el preámbulo inline de React Refresh.
      if (command !== 'build') return []
      return [{ tag: 'meta', injectTo: 'head-prepend', attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'",
      } }]
    },
  }],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': localProxy,
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': localProxy },
  },
}))
