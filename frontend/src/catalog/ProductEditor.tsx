import { useState, type FormEvent } from 'react'
import { Modal } from '../components/Modal'
import { type Product, type ProductInput } from '../services/catalog'
import { priceInput } from './money'
import { CATEGORIES, canonicalCategory, requiresVolume, usesServing, PACKAGES } from './categories'

interface Props { product: Product | null; initialCategory?: string; onClose: () => void; onSave: (input: ProductInput) => Promise<void> }

export function ProductEditor({ product, initialCategory, onClose, onSave }: Props) {
  const [name, setName] = useState(product?.name || '')
  const [category, setCategory] = useState(canonicalCategory(product?.category || initialCategory || '') || '')
  const [packageKind, setPackageKind] = useState(product?.packageKind || '')
  const [volume, setVolume] = useState(String(product?.volumeMl || ''))
  const [unit, setUnit] = useState(product?.unitPriceMinor == null ? '' : priceInput(product.unitPriceMinor))
  const [shot, setShot] = useState(product?.shotPriceMinor == null ? '' : priceInput(product.shotPriceMinor))
  const [remaining, setRemaining] = useState(String(product?.quantityRemaining ?? 0))
  const [operation, setOperation] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const change = (action: () => void) => { action(); setOperation(crypto.randomUUID()); setError('') }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!unit.trim() && !shot.trim()) { setError('Configura al menos un precio por unidad o shot.'); return }
    if (!category) { setError('Selecciona una categoría.'); return }
    if (!/^\d+$/.test(remaining) || !Number.isSafeInteger(Number(remaining))) {
      setError('Las cantidades deben ser números enteros no negativos dentro del rango permitido.'); return
    }
    setBusy(true); setError('')
    try {
      await onSave({ operationId: operation, expectedVersion: product?.version ?? null, name, category, active: product?.active ?? true,
        unitPrice: unit.trim() || null, shotPrice: shot.trim() || null,
        quantitySold: product?.quantitySold ?? 0, quantityRemaining: Number(remaining), imageBase64: null, removeImage: false,
        packageKind: packageKind || null, volumeMl: usesServing(category) || !volume ? null : Number(volume) })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar el producto.') }
    finally { setBusy(false) }
  }

  return <Modal title={product ? 'Editar producto' : 'Nuevo producto'} busy={busy} onClose={onClose}>
    <form id="product-form" className="access-form product-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor="product-name">Nombre del producto</label>
        <input id="product-name" value={name} onChange={(event) => change(() => setName(event.target.value))} required maxLength={120} autoFocus />
        <label htmlFor="product-category">Categoría</label>
        <select id="product-category" required value={category} onChange={(event) => change(() => { setCategory(event.target.value); setPackageKind(''); setVolume('') })}><option value="" disabled>Selecciona una categoría</option>{CATEGORIES.map((value, index) => <option key={value} value={value}>{index + 1}. {value}</option>)}</select>
        {product && !canonicalCategory(product.category) && <p className="field-help">Categoría anterior: {product.category || 'Sin categoría'}. Selecciona una de las categorías actuales.</p>}
        {requiresVolume(category) && <div className="price-fields"><div><label htmlFor="product-package">Presentación</label><select id="product-package" required value={packageKind} onChange={(event) => change(() => { setPackageKind(event.target.value); setVolume(String(PACKAGES.find((item) => item.value === event.target.value)?.ml || '')) })}><option value="" disabled>Selecciona la presentación</option>{PACKAGES.map((item) => <option key={item.value} value={item.value}>{item.name} · {item.ml} ml</option>)}</select></div><div><label htmlFor="product-volume">Contenido · ml</label><input id="product-volume" type="number" min="1" max="10000" step="1" required value={volume} onChange={(event) => change(() => setVolume(event.target.value))} /></div></div>}
        {requiresVolume(category) && <p className="field-help">Crea un producto por cada presentación que vendes. Puedes ajustar los ml según la etiqueta.</p>}
        {category && !requiresVolume(category) && !usesServing(category) && <><label htmlFor="product-volume">Contenido · ml (opcional)</label><input id="product-volume" type="number" min="1" max="10000" step="1" value={volume} onChange={(event) => change(() => setVolume(event.target.value))} /></>}
        {usesServing(category) && <><label htmlFor="product-serving">Presentación</label><select id="product-serving" value={packageKind} onChange={(event) => change(() => setPackageKind(event.target.value))}><option value="">Selecciona vaso o copa</option><option value="VASO">Vaso</option><option value="COPA">Copa</option></select></>}
        <div className="price-fields"><div><label htmlFor="product-unit">Precio por unidad · COP</label><input id="product-unit" inputMode="decimal" value={unit} onChange={(event) => change(() => setUnit(event.target.value))} maxLength={24} placeholder="Ejemplo: 6000" /></div>
          <div><label htmlFor="product-shot">Precio por shot · COP</label><input id="product-shot" inputMode="decimal" value={shot} onChange={(event) => change(() => setShot(event.target.value))} maxLength={24} placeholder="Ejemplo: 8000" /></div></div>
        <p className="field-help">Deja vacío el precio de la presentación que no ofreces. Sin separadores de miles; hasta dos decimales.</p>
        <div className="price-fields"><div><label htmlFor="product-remaining">Cantidad restante</label><input id="product-remaining" type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" required value={remaining} onChange={(event) => change(() => setRemaining(event.target.value))} /></div>
          {product && <div><label htmlFor="product-sold">Cantidad vendida</label><input id="product-sold" type="number" readOnly value={product.quantitySold} /></div>}</div>
        <p className="field-help">Las ventas actualizan las cantidades automáticamente. Cada unidad corresponde a una presentación completa. Para reponer mercancía usa «Agregar existencias»; aquí puedes corregir la cantidad restante.</p>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancelar</button><button id="save-product" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar producto'}</button></footer>
    </form>
  </Modal>
}
