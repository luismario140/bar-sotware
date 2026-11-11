import { useState, type FormEvent } from 'react'
import { useAuthAction } from '../auth/useAuthAction'
import { authRequest } from '../services/auth'
import { AuthFeedback } from './AuthFeedback'

export function CredentialsForm({ username: original, onChanged }: { username: string; onChanged: () => void }) {
  const [username, setUsername] = useState(original)
  const [currentPin, setCurrentPin] = useState('')
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [confirming, setConfirming] = useState(false)
  const action = useAuthAction()

  function prepare(event: FormEvent) {
    event.preventDefault()
    if (pin !== confirmation) { action.setError('Los PIN nuevos no coinciden.'); return }
    action.setError('')
    setConfirming(true)
  }

  function save() {
    void action.run(async () => {
      try {
        await authRequest<void>('credentials', { currentPin, username, pin })
        onChanged()
      } finally {
        setCurrentPin(''); setPin(''); setConfirmation(''); setConfirming(false)
      }
    })
  }

  return <section className="security-panel">
    <h2>Cambiar usuario o PIN</h2>
    <p className="form-description">Confirma tu PIN actual para guardar los cambios. Tu inventario e historial se conservarán.</p>
    <form className="access-form credentials-form" onSubmit={prepare}>
      <fieldset disabled={confirming || action.busy}>
        <label htmlFor="security-username">Usuario</label>
        <input id="security-username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required maxLength={60} />
        <label htmlFor="security-current-pin">PIN actual</label>
        <input id="security-current-pin" name="currentPin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete="current-password" value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} required />
        <label htmlFor="security-pin">Nuevo PIN</label>
        <input id="security-pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value)} required />
        <p className="field-help">Para cambiar solo el usuario, repite aquí tu PIN actual.</p>
        <label htmlFor="security-confirmation">Confirmar nuevo PIN</label>
        <input id="security-confirmation" name="confirmation" type="password" inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
      </fieldset>
      <AuthFeedback error={action.error} remaining={action.remaining} />
      {!confirming ? <button type="submit" disabled={action.busy || action.remaining > 0}>Guardar cambios</button> :
        <div className="confirm-panel" role="group" aria-label="Confirmar cambio de credenciales">
          <p>Actualizarás el acceso del usuario <strong>{username.trim()}</strong>. Al confirmar se cerrará la sesión.</p>
          <div className="button-row"><button id="confirm-credentials" type="button" onClick={save} disabled={action.busy}>{action.busy ? 'Guardando…' : 'Confirmar cambios'}</button>
            <button type="button" className="secondary-button" onClick={() => setConfirming(false)} disabled={action.busy}>Cancelar</button></div>
        </div>}
    </form>
  </section>
}
