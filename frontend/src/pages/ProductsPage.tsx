import { useCallback, useEffect, useState } from 'react'
import { ProductCard } from '../catalog/ProductCard'
import { ProductEditor } from '../catalog/ProductEditor'
import { Modal } from '../components/Modal'
import { catalogRequest, type Product, type ProductInput } from '../services/catalog'

const searchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('')
  const [editor, setEditor] = useState<{ product: Product | null } | null>(null)
  const [confirmation, setConfirmation] = useState<{ product: Product; operation: string } | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { setProducts(await catalogRequest<Product[]>('list')) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar el catálogo.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    if (category && !products.some((product) => product.category === category)) setCategory('')
  }, [products, category])
  const upsert = (product: Product) => setProducts((previous) => [...previous.filter((item) => item.id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name, 'es')))

  async function save(input: ProductInput) {
    const product = await catalogRequest<Product>(editor?.product ? 'update' : 'create', { ...input, ...(editor?.product ? { id: editor.product.id } : {}) })
    if (!editor?.product) { setSearch(''); setCategory(''); setStatus('all') }
    upsert(product); setEditor(null); setMessage('Producto guardado correctamente.')
  }

  async function changeStatus() {
    if (!confirmation || savingStatus) return
    setSavingStatus(true); setStatusError('')
    try {
      const product = await catalogRequest<Product>('status', { id: confirmation.product.id, operationId: confirmation.operation, expectedVersion: confirmation.product.version, active: !confirmation.product.active })
      upsert(product); setConfirmation(null); setMessage(product.active ? 'Producto reactivado.' : 'Producto desactivado. Sus datos se conservan.')
    } catch (failure) { setStatusError(failure instanceof Error ? failure.message : 'No se pudo cambiar el estado.') }
    finally { setSavingStatus(false) }
  }

  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const filtered = products.filter((product) => (status === 'all' || product.active === (status === 'active')) && (!category || product.category === category) && searchText(`${product.name} ${product.category}`).includes(searchText(search.trim())))
  return <section className="catalog-page">
    <div className="catalog-heading"><div><p className="form-description">Organiza tus productos y sus presentaciones.</p><p className="catalog-count">{products.length} productos · {products.filter((item) => item.active).length} activos</p></div>
      <div className="button-row"><button className="secondary-button" disabled={loading} onClick={() => void reload()}>Actualizar</button><button id="new-product" onClick={() => { setMessage(''); setEditor({ product: null }) }}>+ Nuevo producto</button></div></div>
    <div className="catalog-filters"><label>Buscar<input id="product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o categoría" type="search" /></label>
      <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label>
      <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas las categorías</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label></div>
    {message && <p className="form-success" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p className="catalog-empty" role="status">Cargando catálogo…</p> : filtered.length ? <div className="product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} onEdit={() => { setMessage(''); setEditor({ product }) }} onStatus={() => { setStatusError(''); setConfirmation({ product, operation: crypto.randomUUID() }) }} />)}</div>
      : <div className="catalog-empty"><span className="empty-icon">▤</span><h2>{products.length ? 'No hay productos con estos filtros' : 'Tu catálogo comienza aquí'}</h2><p>{products.length ? 'Prueba otro nombre, categoría o estado.' : 'Agrega tu primer producto, sus precios y una imagen si lo deseas.'}</p>{!products.length && <button onClick={() => setEditor({ product: null })}>Crear primer producto</button>}</div>}
    {editor && <ProductEditor product={editor.product} onClose={() => setEditor(null)} onSave={save} />}
    {confirmation && <Modal title={confirmation.product.active ? 'Desactivar producto' : 'Reactivar producto'} busy={savingStatus} onClose={() => setConfirmation(null)}><p>¿Quieres {confirmation.product.active ? 'desactivar' : 'reactivar'} <strong>{confirmation.product.name}</strong>?</p><p className="form-description">El producto y su historial se conservarán.</p>{statusError && <p className="form-error" role="alert">{statusError}</p>}<footer className="dialog-actions"><button className="secondary-button" disabled={savingStatus} onClick={() => setConfirmation(null)}>Cancelar</button><button id="confirm-product-status" disabled={savingStatus} onClick={() => void changeStatus()}>{savingStatus ? 'Guardando…' : 'Confirmar'}</button></footer></Modal>}
  </section>
}
