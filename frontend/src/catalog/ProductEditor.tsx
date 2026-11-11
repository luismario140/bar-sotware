import { useState, type FormEvent, type ChangeEvent } from 'react'
import { Modal } from '../components/Modal'
import { ProductImage } from './ProductImage'
import { type Product, type ProductInput } from '../services/catalog'
import { priceInput } from './money'

interface Props { product: Product | null; onClose: () => void; onSave: (input: ProductInput) => Promise<void> }

export function ProductEditor({ product, onClose, onSave }: Props) {
  const [name, setName] = useState(product?.name || '')
  const [category, setCategory] = useState(product?.category || '')
  const [unit, setUnit] = useState(product?.unitPriceMinor == null ? '' : priceInput(product.unitPriceMinor))
  const [shot, setShot] = useState(product?.shotPriceMinor == null ? '' : priceInput(product.shotPriceMinor))
  const [image, setImage] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [operation, setOperation] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(product?.active ?? true)
  const change = (action: () => void) => { action(); setOperation(crypto.randomUUID()); setError('') }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024 || (file.type && !['image/png', 'image/jpeg'].includes(file.type))) {
      setError('Selecciona una imagen PNG o JPEG de hasta 5 MiB.'); event.target.value = ''; return
    }
    setReading(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file)
      })
      change(() => { setImage(data); setRemoveImage(false) })
    } catch { setError('No se pudo leer el archivo. Vuelve a seleccionarlo.') }
    finally { setReading(false); event.target.value = '' }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || reading) return
    if (!unit.trim() && !shot.trim()) { setError('Configura al menos un precio por unidad o shot.'); return }
    setBusy(true); setError('')
    try {
      await onSave({ operationId: operation, expectedVersion: product?.version ?? null, name, category, active,
        unitPrice: unit.trim() || null, shotPrice: shot.trim() || null,
        imageBase64: image ? image.slice(image.indexOf(',') + 1) : null, removeImage })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar el producto.') }
    finally { setBusy(false) }
  }

  return <Modal title={product ? 'Editar producto' : 'Nuevo producto'} busy={busy || reading} onClose={onClose}>
    <form id="product-form" className="access-form product-form" onSubmit={submit}>
      <fieldset disabled={busy || reading}>
        <label htmlFor="product-name">Nombre del producto</label>
        <input id="product-name" value={name} onChange={(event) => change(() => setName(event.target.value))} required maxLength={120} autoFocus />
        <label htmlFor="product-category">Categoría <span className="field-help">(opcional)</span></label>
        <input id="product-category" value={category} onChange={(event) => change(() => setCategory(event.target.value))} maxLength={60} placeholder="Ejemplo: Cervezas" />
        <div className="price-fields"><div><label htmlFor="product-unit">Precio por unidad · COP</label><input id="product-unit" inputMode="decimal" value={unit} onChange={(event) => change(() => setUnit(event.target.value))} maxLength={24} placeholder="Ejemplo: 6000" /></div>
          <div><label htmlFor="product-shot">Precio por shot · COP</label><input id="product-shot" inputMode="decimal" value={shot} onChange={(event) => change(() => setShot(event.target.value))} maxLength={24} placeholder="Ejemplo: 8000" /></div></div>
        <p className="field-help">Deja vacío el precio de la presentación que no ofreces. Sin separadores de miles; hasta dos decimales.</p>
        {!product && <label className="checkbox-label"><input type="checkbox" checked={active} onChange={(event) => change(() => setActive(event.target.checked))} />Producto activo</label>}
        <label htmlFor="product-file">Imagen <span className="field-help">(opcional)</span></label>
        <div className="image-editor">
          <div className="image-preview">{image ? <img src={image} alt="Vista previa de la imagen seleccionada" /> : product?.imageId && !removeImage ? <ProductImage product={product} /> : <span>Sin imagen</span>}</div>
          <div><input id="product-file" type="file" accept="image/png,image/jpeg" onChange={(event) => void selectImage(event)} /><p className="field-help">PNG o JPEG · Hasta 5 MiB<br />Se guardará una copia en este equipo.</p>
            {(image || (product?.imageId && !removeImage)) && <button type="button" className="text-button" onClick={() => change(() => { setImage(null); setRemoveImage(true) })}>Quitar imagen</button>}</div>
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy || reading}>Cancelar</button><button id="save-product" type="submit" disabled={busy || reading}>{reading ? 'Leyendo imagen…' : busy ? 'Guardando…' : 'Guardar producto'}</button></footer>
    </form>
  </Modal>
}
