import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuthAction } from '../auth/useAuthAction'
import { AuthFeedback } from '../components/AuthFeedback'
import { CredentialsForm } from '../components/CredentialsForm'
import { Modal } from '../components/Modal'
import { PinField } from '../components/PinField'
import { SecurityGuidelines } from '../components/SecurityGuidelines'
import { backupRequest, backupUpdated, type BackupFile, type RestoreSelection } from '../services/backups'

const date = (value: string) => Number.isNaN(new Date(value).getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const kind = (value: BackupFile['kind']) => value === 'manual' ? 'Manual' : value === 'pre-restore' ? 'Antes de restaurar' : 'Antes de actualizar'

export function SecurityPage({ username, recoveryEmail, onCredentialsChanged, onBusyChange }: {
  username: string; recoveryEmail: string | null; onCredentialsChanged: () => void; onBusyChange: (busy: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [credentialsBusy, setCredentialsBusy] = useState(false)
  const [files, setFiles] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [selection, setSelection] = useState<RestoreSelection | null>(null)
  const [currentPin, setCurrentPin] = useState('')
  const action = useAuthAction()
  const restoreAction = useAuthAction()
  const desktop = Boolean(window.appbarpos)
  const busy = action.busy || restoreAction.busy || credentialsBusy

  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false) }, [busy, onBusyChange])
  const reload = useCallback(async () => {
    if (!window.appbarpos) return
    setLoading(true); setLoadError('')
    try { setFiles(await backupRequest<BackupFile[]>('list')) }
    catch (failure) { setLoadError(failure instanceof Error ? failure.message : 'No se pudieron consultar los respaldos.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])

  function operate(label: string, task: () => Promise<void>) {
    void action.run(async () => {
      setWorking(label); setNotice('')
      try { await task() } finally { setWorking('') }
    })
  }
  function restore(event: FormEvent) {
    event.preventDefault()
    if (!selection) return
    void restoreAction.run(async () => {
      setWorking('Restaurando datos. Espera mientras la aplicación vuelve a iniciar…'); setNotice('')
      try {
        await backupRequest('restore', { id: selection.id, currentPin })
        setNotice('Respaldo restaurado. Volviendo al inicio de sesión…')
      } finally { setCurrentPin(''); setWorking('') }
    })
  }
  function cancelRestore() {
    operate('Cerrando la revisión del respaldo…', async () => { await backupRequest('cancelRestore'); setSelection(null); setCurrentPin(''); restoreAction.setError('') })
  }

  return <div className="security-layout">
    <div className="security-options">
      <section aria-labelledby="access-options-title">
        <p className="eyebrow">ADMINISTRA TU ACCESO</p>
        <h2 id="access-options-title">Acceso del administrador</h2>
        <button id="edit-credentials" type="button" className="security-option" disabled={busy || loading} onClick={() => setEditing(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z" /><path d="m8 12 3 3 5-6" /></svg>
          <span><strong>Cambiar datos de acceso</strong><small>Usuario, PIN y correo de recuperación</small></span><span aria-hidden="true">›</span>
        </button>
        {!recoveryEmail && <p className="security-email-note">Añade un correo de recuperación en esta opción para poder restablecer tu PIN.</p>}
      </section>
      <section className="backup-panel" aria-labelledby="backups-title">
        <p className="eyebrow">PROTEGE LA INFORMACIÓN DE TU BAR</p>
        <h2 id="backups-title">Respaldos de datos</h2>
        <p className="form-description">Guarda productos, ventas, cuentas, datos de acceso e imágenes en un archivo ZIP. Conserva una copia fuera de este equipo.</p>
        <div className="backup-actions">
          <button id="create-backup" type="button" disabled={!desktop || busy || loading} onClick={() => operate('Creando respaldo…', async () => {
            await backupRequest<BackupFile>('create'); backupUpdated(); await reload(); setNotice('Respaldo creado y guardado en este equipo.')
          })}>Crear respaldo ahora</button>
          <button id="choose-backup" type="button" className="secondary-button" disabled={!desktop || busy || loading} onClick={() => operate('Comprobando el respaldo seleccionado…', async () => {
            const chosen = await backupRequest<RestoreSelection | null>('chooseRestore')
            if (chosen) { setSelection(chosen); setCurrentPin('') }
          })}>Restaurar desde un ZIP</button>
          <button id="open-backup-folder" type="button" className="text-button" disabled={!desktop || busy || loading} onClick={() => operate('Abriendo la carpeta…', async () => { await backupRequest('openFolder') })}>Abrir carpeta de respaldos</button>
        </div>
        {!desktop && <p className="field-help">Estas opciones están disponibles en la aplicación de escritorio.</p>}
        {working && <p className="backup-progress" role="status">{working}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}
        {!selection && <AuthFeedback error={action.error} remaining={action.remaining} />}
        <div className="backup-history-heading"><h3>Respaldos guardados</h3><button id="refresh-backups" type="button" className="text-button" disabled={!desktop || busy || loading} onClick={() => void reload()}>Actualizar lista</button></div>
        {loadError && <p className="form-error" role="alert">{loadError}</p>}
        {loading ? <p className="field-help" role="status">Consultando respaldos…</p> : files.length ? <>
          <div className="backup-list">{(showAll ? files : files.slice(0, 5)).map(file => <article className="backup-row" key={file.filename} data-backup-file={file.filename}>
            <div><strong>{date(file.createdAt)}</strong><small>{kind(file.kind)} · {(file.sizeBytes / 1024 / 1024).toLocaleString('es-CO', { maximumFractionDigits: 2 })} MB</small></div>
            <button type="button" className="secondary-button" disabled={busy} aria-label={`Guardar copia del respaldo del ${date(file.createdAt)}`} onClick={() => operate('Guardando una copia del respaldo…', async () => {
              const result = await backupRequest<{ saved: boolean } | null>('export', { filename: file.filename })
              if (result?.saved) setNotice('Copia guardada en la ubicación que elegiste.')
            })}>Guardar copia…</button>
          </article>)}</div>
          {files.length > 5 && <button type="button" className="text-button" disabled={busy} onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver solo los últimos 5' : `Ver los ${files.length} respaldos`}</button>}
        </> : !loadError && desktop && <p className="field-help">No hay respaldos registrados. Crea el primero antes de continuar trabajando.</p>}
      </section>
    </div>
    <SecurityGuidelines />
    {editing && <Modal title="Cambiar datos de acceso" busy={credentialsBusy} onClose={() => setEditing(false)}>
      <CredentialsForm username={username} recoveryEmail={recoveryEmail} onChanged={onCredentialsChanged} onBusyChange={setCredentialsBusy} />
    </Modal>}
    {selection && <Modal title="Restaurar respaldo" busy={busy} onClose={cancelRestore}>
      <div className="restore-summary"><strong>{date(selection.createdAt)}</strong><span>{selection.filename}</span></div>
      <p>Se recuperarán los datos y las imágenes de ese momento. Las ventas y los cambios posteriores no estarán incluidos.</p>
      <p className="restore-warning">Antes de reemplazar los datos se guardará una copia de seguridad del estado actual. Al terminar, tendrás que iniciar sesión con el usuario y el PIN que existían en ese respaldo.</p>
      <form className="access-form" onSubmit={restore}>
        <label htmlFor="restore-current-pin">Confirma tu PIN actual</label>
        <PinField id="restore-current-pin" name="currentPin" value={currentPin} onChange={setCurrentPin} autoComplete="current-password" disabled={busy} />
        <AuthFeedback error={restoreAction.error} remaining={restoreAction.remaining} />
        <AuthFeedback error={action.error} remaining={action.remaining} />
        {working && <p role="status">{working}</p>}
        <footer className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={cancelRestore}>Cancelar</button><button id="confirm-restore" type="submit" className="danger-button" disabled={busy || restoreAction.remaining > 0}>Restaurar y reiniciar</button></footer>
      </form>
    </Modal>}
  </div>
}
