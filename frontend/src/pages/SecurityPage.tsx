import { useEffect, useState } from 'react'
import { CredentialsForm } from '../components/CredentialsForm'
import { Modal } from '../components/Modal'
import { SecurityGuidelines } from '../components/SecurityGuidelines'

export function SecurityPage({ username, recoveryEmail, onCredentialsChanged, onBusyChange }: {
  username: string; recoveryEmail: string | null; onCredentialsChanged: () => void; onBusyChange: (busy: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [credentialsBusy, setCredentialsBusy] = useState(false)
  useEffect(() => { onBusyChange(credentialsBusy); return () => onBusyChange(false) }, [credentialsBusy, onBusyChange])

  return <div className="security-layout">
    <div className="security-options">
      <section aria-labelledby="access-options-title">
        <p className="eyebrow">ADMINISTRA TU ACCESO</p>
        <h2 id="access-options-title">Acceso del administrador</h2>
        <button id="edit-credentials" type="button" className="security-option" disabled={credentialsBusy} onClick={() => setEditing(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z" /><path d="m8 12 3 3 5-6" /></svg>
          <span><strong>Cambiar datos de acceso</strong><small>Usuario, PIN y correo de recuperación</small></span><span aria-hidden="true">›</span>
        </button>
        {!recoveryEmail && <p className="security-email-note">Añade un correo de recuperación en esta opción para poder restablecer tu PIN.</p>}
      </section>
    </div>
    <SecurityGuidelines />
    {editing && <Modal title="Cambiar datos de acceso" busy={credentialsBusy} onClose={() => setEditing(false)}>
      <CredentialsForm username={username} recoveryEmail={recoveryEmail} onChanged={onCredentialsChanged} onBusyChange={setCredentialsBusy} />
    </Modal>}
  </div>
}
