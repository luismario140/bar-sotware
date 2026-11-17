import { useEffect, useState } from 'react'
import type { AppInfo } from '../services/system'

const backupDate = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function AppFooter({ className = '' }: { className?: string }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const desktop = Boolean(window.appbarpos)

  useEffect(() => {
    if (!window.appbarpos) return
    let active = true
    async function refresh() {
      try {
        const result = await window.appbarpos!.appInfo()
        if (active) { setInfo(result); setFailed(false) }
      } catch { if (active) setFailed(true) }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 60000)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])

  const timestamp = info?.lastBackupAt ? new Date(info.lastBackupAt) : null
  const validDate = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
  return <footer className={`sidebar-footer ${className}`.trim()}>
    <div className="footer-version">AppBarPOS <span>{info ? `v${info.version}` : !desktop ? '· Web' : failed ? '· Versión no disponible' : '· Consultando versión…'}</span></div>
    <p className="footer-credit">Desarrollada por <strong>Mario Dev</strong></p>
    <div className="footer-backup">
      <span>Último respaldo de datos</span>
      {!desktop ? <p>Consultar desde la aplicación de escritorio</p> : failed || info?.backupStatus === 'unavailable' ? <p>No se pudo consultar</p> : !info ? <p>Consultando…</p> : validDate ?
        <time dateTime={validDate.toISOString()} title="Fecha y hora local de este equipo">{backupDate.format(validDate)}</time> : <p>Sin respaldos registrados</p>}
    </div>
  </footer>
}
