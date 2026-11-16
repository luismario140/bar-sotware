import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { catalogRequest, type Product } from '../services/catalog'
import { packageLabel } from './categories'

export function RestockEditor({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: (product: Product) => void }) {
  const [quantity, setQuantity] = useState('')
  const [operation, setOperation] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const amount = Number(quantity)
  const valid = /^\d+$/.test(quantity) && Number.isSafeInteger(amount) && amount > 0 && Number.isSafeInteger(product.quantityRemaining + amount)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!valid) { setError('Indica una cantidad entera mayor que cero dentro del rango permitido.'); return }
    setBusy(true); setError('')
    try { onSaved(await catalogRequest<Product>('restock', { id: product.id, expectedVersion: product.version, operationId: operation, quantity: amount })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudieron agregar las existencias.') }
    finally { setBusy(false) }
  }

  return <Modal title="Agregar existencias" busy={busy} onClose={onClose}>
    <p><strong>{product.name}</strong>{packageLabel(product) && <> · {packageLabel(product)}</>}</p>
    <p className="form-description">Disponibles: {product.quantityRemaining.toLocaleString('es-CO')} unidades. La nueva mercancía se sumará a esta cantidad.</p>
    <form className="access-form" onSubmit={submit}>
      <label htmlFor="restock-quantity">Unidades recibidas</label>
      <input id="restock-quantity" type="number" required min="1" max={Number.MAX_SAFE_INTEGER - product.quantityRemaining} step="1" autoFocus disabled={busy} value={quantity} onChange={(event) => { setQuantity(event.target.value); setOperation(crypto.randomUUID()); setError('') }} />
      {valid && <p className="stock-preview" role="status">Quedarán <strong>{(product.quantityRemaining + amount).toLocaleString('es-CO')} unidades</strong>. La cantidad vendida se conserva.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancelar</button><button id="confirm-restock" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Agregar existencias'}</button></footer>
    </form>
  </Modal>
}
