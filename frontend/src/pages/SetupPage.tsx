import { displayName } from '../catalog/names'
import { useEffect, useState } from 'react'
import { StatusCard } from '../components/StatusCard'
import { getSystemHealth, type SystemHealth } from '../services/system'
import { SecurityPage } from './SecurityPage'
import { AppFooter } from '../components/AppFooter'
import { ProductsPage } from './ProductsPage'
import { SalesPage } from './SalesPage'

export function SetupPage({ username, recoveryEmail, onLogout, onCredentialsChanged }: {
  username: string; recoveryEmail: string | null; onLogout: () => Promise<void>; onCredentialsChanged: () => void
}) {
  const [section, setSection] = useState<'products' | 'sales' | 'security' | 'system'>('products')
  const [saleBusy, setSaleBusy] = useState(false)
  const [securityBusy, setSecurityBusy] = useState(false)
  const appBusy = saleBusy || securityBusy
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setChecking(true)
    setError('')
    getSystemHealth(controller.signal)
      .then((result) => { if (active) setHealth(result) })
      .catch(() => {
        if (active) {
          setHealth(null)
          setError('No se pudo conectar con el backend local. Comprueba que esté en ejecución.')
        }
      })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false; controller.abort() }
  }, [attempt])

  const available = health?.status === 'UP'
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#inicio"><span className="brand-icon">A</span>AppBarPOS</a>
        <div className="sidebar-account"><strong>{displayName(username)}</strong><span>Administrador · Acceso local</span></div>
        <p className="sidebar-label">ADMINISTRACIÓN</p>
        <nav aria-label="Navegación principal">
          <button id="products-navigation" disabled={appBusy} className={`nav-button ${section === 'products' ? 'nav-active' : ''}`} onClick={() => setSection('products')}>Inventario</button>
          <button id="sales-navigation" disabled={appBusy} className={`nav-button ${section === 'sales' ? 'nav-active' : ''}`} onClick={() => setSection('sales')}>Registrar venta</button>
          <button id="security-navigation" disabled={appBusy} className={`nav-button ${section === 'security' ? 'nav-active' : ''}`} onClick={() => setSection('security')}>Acceso y seguridad</button>
          <button id="system-navigation" disabled={appBusy} className={`nav-button ${section === 'system' ? 'nav-active' : ''}`} onClick={() => setSection('system')}>Estado del sistema</button>
        </nav>
        <button id="logout" className="secondary-button sidebar-logout" disabled={loggingOut || appBusy} onClick={async () => {
            setLoggingOut(true); setLogoutError('')
            try { await onLogout() } catch (failure) { setLogoutError(failure instanceof Error ? failure.message : 'No se pudo cerrar la sesión.') }
            finally { setLoggingOut(false) }
          }}>{loggingOut ? 'Cerrando…' : 'Cerrar sesión'}</button>
        {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
        <AppFooter />
      </aside>
      <main id="inicio" className={`app-main ${section === 'sales' ? 'app-main-sales' : ''}`}>
        <header className="page-header">
          <div><p className="eyebrow">APPBARPOS / ADMINISTRACIÓN</p><h1>{section === 'products' ? 'Inventario' : section === 'sales' ? 'Registrar venta' : section === 'security' ? 'Acceso y seguridad' : 'Estado del sistema'}</h1></div>
        </header>
        <div className={`page-content ${section === 'sales' ? 'page-content-sales' : section === 'products' ? 'page-content-inventory' : ''}`}>
        {section === 'products' ? <ProductsPage /> : section === 'sales' ? null : section === 'security' ? <SecurityPage username={username} recoveryEmail={recoveryEmail} onCredentialsChanged={onCredentialsChanged} onBusyChange={setSecurityBusy} /> : <>
        <section className="welcome">
          <p className="eyebrow">UN PUNTO DE PARTIDA PARA TU BAR</p>
          <h2>Todo comienza con una base sólida.</h2>
          <p>Verifica la conexión local antes de continuar con las siguientes etapas del proyecto.</p>
        </section>
        <section className="status-grid" aria-label="Estado técnico">
          <StatusCard title="INTERFAZ" value="Disponible" description="React se está ejecutando en este equipo." ready />
          <StatusCard title="BACKEND LOCAL" value={checking ? 'Verificando…' : available ? 'Conectado' : 'Sin conexión'} description="Servicio Java y Spring Boot." ready={available} />
          <StatusCard title="BASE DE DATOS" value={checking ? 'Verificando…' : health?.database === 'UP' ? 'Disponible' : 'Sin verificar'} description="SQLite con almacenamiento persistente local." ready={health?.database === 'UP'} />
        </section>
        <section className="technical-panel">
          <div><h2>Diagnóstico de conexión</h2><p>Esta pantalla consulta el servicio local; no registra operaciones del negocio.</p></div>
          <button type="button" disabled={checking} onClick={() => setAttempt((value) => value + 1)}>{checking ? 'Verificando…' : 'Verificar conexión'}</button>
          <p role="status" className={error ? 'message error' : 'message'}>{error || (checking ? 'Comprobando el servicio y SQLite…' : available ? 'El backend y la base de datos responden correctamente.' : 'Pendiente de verificación.')}</p>
        </section>
        </>}
        <div className="sales-panel" hidden={section !== 'sales'}><SalesPage active={section === 'sales'} onBusyChange={setSaleBusy} /></div>
        </div>
      </main>
    </div>
  )
}
