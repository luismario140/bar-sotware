import { SetupPage } from '../pages/SetupPage'
import { AuthPage } from '../pages/AuthPage'
import { authRequest, type AuthState } from '../services/auth'
import { useCallback, useEffect, useState } from 'react'

export default function App() {
  const [state, setState] = useState<AuthState | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const refresh = useCallback(async () => {
    setError('')
    try { setState(await authRequest<AuthState>('session')) }
    catch (failure) { setState(null); setError(failure instanceof Error ? failure.message : 'No se pudo comprobar el acceso.') }
  }, [])

  useEffect(() => {
    void refresh()
    const expired = () => { setMessage('La sesión terminó. Inicia sesión para continuar.'); void refresh() }
    window.addEventListener('appbarpos:session-expired', expired)
    return () => window.removeEventListener('appbarpos:session-expired', expired)
  }, [refresh])

  if (!state) return <main className="connection-page"><div className="brand"><span className="brand-icon">A</span>AppBarPOS</div><h1>{error ? 'No se pudo comprobar el acceso' : 'Conectando con AppBarPOS…'}</h1>
    {error && <><p role="alert">{error}</p><button onClick={() => void refresh()}>Volver a intentar</button></>}</main>

  if (!state.authenticated) return <AuthPage key={state.configured ? 'login' : 'setup'} configured={state.configured} message={message}
    onAuthenticated={(next) => { setMessage(''); setState(next) }}
    onConfigured={() => { setMessage('El administrador ya está configurado. Inicia sesión para continuar.'); setState({ configured: true, authenticated: false, username: null }) }} />

  return <SetupPage username={state.username!} onLogout={async () => {
    await authRequest<void>('logout')
    setMessage('Sesión cerrada.')
    setState({ configured: true, authenticated: false, username: null })
  }} onCredentialsChanged={() => {
    setMessage('Credenciales actualizadas. Inicia sesión con tu nuevo acceso.')
    setState({ configured: true, authenticated: false, username: null })
  }} />
}
