import { useState, type FormEvent } from 'react'
import { useAuthAction } from '../auth/useAuthAction'
import { AuthFeedback } from '../components/AuthFeedback'
import { AuthError, authRequest, type AuthState } from '../services/auth'

interface Props { configured: boolean; message: string; onAuthenticated: (state: AuthState) => void; onConfigured: () => void }

export function AuthPage({ configured, message, onAuthenticated, onConfigured }: Props) {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const action = useAuthAction()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!configured && pin !== confirmation) { action.setError('Los PIN no coinciden.'); return }
    void action.run(async () => {
      try {
        const state = await authRequest<AuthState>(configured ? 'login' : 'setup', { username, pin })
        onAuthenticated(state)
      } catch (failure) {
        if (failure instanceof AuthError && failure.code === 'ALREADY_CONFIGURED') { onConfigured(); return }
        throw failure
      } finally {
        setPin('')
        setConfirmation('')
      }
    })
  }

  return (
    <main className="access-layout">
      <section className="access-story" aria-label="AppBarPOS">
        <div className="brand"><span className="brand-icon">A</span>AppBarPOS</div>
        <div className="access-intro"><p className="eyebrow">TU BAR, EN TUS MANOS</p>
          <h1>Un lugar para<br />organizar tu negocio.</h1>
          <p>Accede a tu espacio de administración desde este equipo.</p>
        </div>
        <div className="local-badge"><span className="status-dot ready" />Acceso local · Sin internet</div>
      </section>
      <section className="access-card">
        <p className="eyebrow">{configured ? 'ACCESO ADMINISTRATIVO' : 'PRIMER USO'}</p>
        <h2>{configured ? 'Bienvenido de nuevo' : 'Configura tu acceso'}</h2>
        <p className="form-description">{configured ? 'Introduce tu usuario y PIN para continuar.' : 'Elige el usuario y el PIN del único administrador de tu bar.'}</p>
        {message && <p className="form-success" role="status">{message}</p>}
        <form onSubmit={submit} className="access-form">
          <label htmlFor="access-username">Usuario</label>
          <input id="access-username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={60} disabled={action.busy} autoFocus />
          <label htmlFor="access-pin">PIN</label>
          <input id="access-pin" name="pin" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete={configured ? 'current-password' : 'new-password'} value={pin} onChange={(event) => setPin(event.target.value)} required disabled={action.busy} aria-describedby="pin-help" />
          <p id="pin-help" className="field-help">De 4 a 12 dígitos. Los ceros al inicio se conservan.</p>
          {!configured && <>
            <label htmlFor="access-confirmation">Confirmar PIN</label>
            <input id="access-confirmation" name="confirmation" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={action.busy} />
          </>}
          <button type="button" className="text-button pin-toggle" aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? 'Ocultar PIN' : 'Mostrar PIN'}</button>
          <AuthFeedback error={action.error} remaining={action.remaining} />
          <button type="submit" className="primary-button" disabled={action.busy || action.remaining > 0}>{action.busy ? 'Validando…' : configured ? 'Iniciar sesión' : 'Crear administrador y entrar'}</button>
        </form>
        <p className="access-footer">Tus datos permanecen guardados en este equipo.</p>
      </section>
    </main>
  )
}
