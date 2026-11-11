import { useEffect, useRef, type ReactNode } from 'react'

export function Modal({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const reference = useRef<HTMLDialogElement>(null)
  useEffect(() => { reference.current?.showModal(); return () => reference.current?.close() }, [])
  return <dialog ref={reference} className="app-dialog" aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <header className="dialog-header"><h2 id="dialog-title">{title}</h2><button type="button" className="text-button" disabled={busy} onClick={onClose} aria-label="Cerrar formulario">Cerrar</button></header>
    {children}
  </dialog>
}
