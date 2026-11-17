import { useState, type FormEvent } from 'react'
import { useAuthAction } from '../auth/useAuthAction'
import { authRequest } from '../services/auth'
import { AuthFeedback } from './AuthFeedback'
import { PinField } from './PinField'

export function RecoveryForm({ onBack }: { onBack: (message?: string) => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [sent, setSent] = useState(false)
  const [notice, setNotice] = useState('')
  const action = useAuthAction()

  function request(event?: FormEvent) {
    event?.preventDefault()
    void action.run(async () => {
      await authRequest<void>('recovery-request', { email })
      setSent(true)
      setCode('')
      setNotice('Si el correo coincide con el registrado, recibirás un código válido por 10 minutos. Revisa también spam.')
    })
  }

  function reset(event: FormEvent) {
    event.preventDefault()
    if (pin !== confirmation) { action.setError('Los PIN nuevos no coinciden.'); return }
    void action.run(async () => {
      try {
        await authRequest<void>('recovery-reset', { email, code, pin })
        onBack('PIN actualizado. Inicia sesión con tu usuario y el nuevo PIN.')
      } finally { setPin(''); setConfirmation(''); setCode('') }
    })
  }

  return <>
    <p className="eyebrow">RECUPERACIÓN DE ACCESO</p>
    <h2>Vuelve a entrar a tu bar</h2>
    <p className="form-description">{sent ? 'Escribe el código del correo y elige un PIN nuevo de 4 dígitos.' : 'Usa el correo que registraste al crear el administrador. Necesitas conexión a internet para recibir el código.'}</p>
    <form className="access-form" onSubmit={sent ? reset : request}>
      <label htmlFor="recovery-email">Correo de recuperación</label>
      <input id="recovery-email" name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={action.busy || sent} autoFocus />
      {sent && <>
        <p className="form-success" role="status">{notice}</p>
        <label htmlFor="recovery-code">Código del correo · 8 dígitos</label>
        <input id="recovery-code" name="code" className="recovery-code" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} minLength={8} autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))} disabled={action.busy} />
        <div className="recovery-pin-pair">
          <div><label htmlFor="recovery-pin">Nuevo PIN</label>
            <PinField id="recovery-pin" name="pin" autoComplete="new-password" value={pin} onChange={setPin} disabled={action.busy} /></div>
          <div><label htmlFor="recovery-confirmation">Confirmar PIN</label>
            <PinField id="recovery-confirmation" name="confirmation" autoComplete="new-password" value={confirmation} onChange={setConfirmation} disabled={action.busy} /></div>
        </div>
      </>}
      <AuthFeedback error={action.error} remaining={action.remaining} />
      <button type="submit" className="primary-button" disabled={action.busy || action.remaining > 0}>{action.busy ? 'Procesando…' : sent ? 'Guardar nuevo PIN' : 'Enviar código de recuperación'}</button>
      {sent && <div className="recovery-actions">
        <button type="button" className="text-button" onClick={() => request()} disabled={action.busy || action.remaining > 0}>Reenviar código</button>
        <button type="button" className="text-button" onClick={() => { setSent(false); setCode(''); setPin(''); setConfirmation(''); action.setError('') }} disabled={action.busy}>Corregir correo</button>
      </div>}
      <button type="button" className="text-button" disabled={action.busy} onClick={() => onBack()}>Volver al inicio de sesión</button>
    </form>
    <p className="access-footer">El PIN actual nunca se envía por correo. Un código nuevo reemplaza al anterior.</p>
  </>
}
