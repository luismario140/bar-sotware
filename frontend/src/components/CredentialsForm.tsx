import { PinField } from './PinField'
import { UsernameField } from './UsernameField'
import { displayName } from '../catalog/names'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuthAction } from '../auth/useAuthAction'
import { authRequest } from '../services/auth'
import { AuthFeedback } from './AuthFeedback'

export function CredentialsForm({ username: original, recoveryEmail: originalEmail, onChanged, onBusyChange }: { username: string; recoveryEmail: string | null; onChanged: () => void; onBusyChange: (busy: boolean) => void }) {
  const [username, setUsername] = useState(original)
  const [recoveryEmail, setRecoveryEmail] = useState(originalEmail || '')
  const [currentPin, setCurrentPin] = useState('')
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [confirming, setConfirming] = useState(false)
  const action = useAuthAction()
  useEffect(() => { onBusyChange(action.busy); return () => onBusyChange(false) }, [action.busy, onBusyChange])

  function prepare(event: FormEvent) {
    event.preventDefault()
    if (pin !== confirmation) { action.setError('Los PIN nuevos no coinciden.'); return }
    action.setError('')
    setConfirming(true)
  }

  function save() {
    void action.run(async () => {
      try {
        await authRequest<void>('credentials', { currentPin, username, pin, recoveryEmail })
        onChanged()
      } finally {
        setCurrentPin(''); setPin(''); setConfirmation(''); setConfirming(false)
      }
    })
  }

  return <section className="credentials-panel">
    <p className="form-description">Confirma tu PIN actual para guardar los cambios. Tu inventario e historial se conservarán.</p>
    <form className="access-form credentials-form" onSubmit={prepare}>
      <fieldset disabled={confirming || action.busy}>
        <label htmlFor="security-username">Usuario</label>
        <UsernameField id="security-username" value={username} onChange={setUsername} />
        <label htmlFor="security-email">Correo de recuperación</label>
        <input id="security-email" name="recoveryEmail" type="email" autoComplete="email" maxLength={254} required value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="nombre@correo.com" aria-describedby="security-email-help" />
        <p id="security-email-help" className="field-help">{originalEmail ? 'Confirma tu PIN actual para actualizar este correo.' : 'Todavía no tienes un correo registrado. Añádelo para poder recuperar tu acceso.'}</p>
        <label htmlFor="security-current-pin">PIN actual</label>
        <PinField id="security-current-pin" name="currentPin" autoComplete="current-password" value={currentPin} onChange={setCurrentPin} />
        <label htmlFor="security-pin">Nuevo PIN</label>
        <PinField id="security-pin" name="pin" autoComplete="new-password" value={pin} onChange={setPin} />
        <p className="field-help">El nuevo PIN debe tener 4 dígitos. Para conservar un PIN actual de 4 dígitos, repítelo aquí.</p>
        <label htmlFor="security-confirmation">Confirmar nuevo PIN</label>
        <PinField id="security-confirmation" name="confirmation" autoComplete="new-password" value={confirmation} onChange={setConfirmation} />
      </fieldset>
      <AuthFeedback error={action.error} remaining={action.remaining} />
      {!confirming ? <button type="submit" disabled={action.busy || action.remaining > 0}>Guardar cambios</button> :
        <div className="confirm-panel" role="group" aria-label="Confirmar cambio de credenciales">
          <p>Actualizarás el acceso del usuario <strong>{displayName(username.trim())}</strong> y su correo de recuperación: <strong>{recoveryEmail.trim()}</strong>. Al confirmar se cerrará la sesión.</p>
          <div className="button-row"><button id="confirm-credentials" type="button" onClick={save} disabled={action.busy}>{action.busy ? 'Guardando…' : 'Confirmar cambios'}</button>
            <button type="button" className="secondary-button" onClick={() => setConfirming(false)} disabled={action.busy}>Cancelar</button></div>
        </div>}
    </form>
  </section>

}
