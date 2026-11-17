import { displayName } from '../catalog/names'
import { useCallback, useEffect, useState } from 'react'
import { ProductEditor } from '../catalog/ProductEditor'
import { money } from '../catalog/money'
import { Modal } from '../components/Modal'
import { RestockEditor } from '../catalog/RestockEditor'
import { CATEGORIES, canonicalCategory, packageLabel, requiresVolume, searchText } from '../catalog/categories'
import { catalogRequest, type Product, type ProductInput } from '../services/catalog'

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [editor, setEditor] = useState<{ product: Product | null; category?: string } | null>(null)
  const [restock, setRestock] = useState<Product | null>(null)
  const [openedCategory, setOpenedCategory] = useState('')
  const [deletion, setDeletion] = useState<{ product: Product; operation: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function deleteProduct() {
    if (!deletion || deleting) return
    setDeleting(true); setDeleteError('')
    try {
      await catalogRequest<Product>('delete', { id: deletion.product.id, operationId: deletion.operation, expectedVersion: deletion.product.version })
      setProducts((previous) => previous.filter((product) => product.id !== deletion.product.id))
      setDeletion(null); setMessage('Producto eliminado del inventario.')
    } catch (failure) { setDeleteError(failure instanceof Error ? failure.message : 'No se pudo eliminar el producto.') }
    finally { setDeleting(false) }
  }

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { setProducts(await catalogRequest<Product[]>('list')) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar el inventario.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  const upsert = (product: Product) => setProducts((previous) => [...previous.filter((item) => item.id !== product.id), product])

  async function save(input: ProductInput) {
    const product = await catalogRequest<Product>(editor?.product ? 'update' : 'create', { ...input, ...(editor?.product ? { id: editor.product.id } : {}) })
    setSearch(''); setCategory(''); setOpenedCategory(product.category)
    upsert(product)
    setEditor(null); setMessage('Producto guardado en el inventario.')
  }

  const unclassified = products.filter((product) => !canonicalCategory(product.category))
  const groups = [...CATEGORIES.map((name, index) => ({ name, number: index + 1, products: products.filter((product) => canonicalCategory(product.category) === name) })),
    ...(unclassified.length ? [{ name: 'Por clasificar', number: 0, products: unclassified }] : [])]
    .filter((group) => !category || group.name === category)
    .map((group) => ({ ...group, products: group.products.filter((product) => searchText(`${product.id} ${displayName(product.name)} ${product.category} ${packageLabel(product)}`).includes(searchText(search))).sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
    .filter((group) => !search.trim() || group.products.length > 0)
  return <section className="catalog-page">
    <div className="catalog-heading"><div><p className="form-description">Controla los productos y las existencias de tu bar.</p><p className="catalog-count">{products.length} productos · 8 categorías</p></div>
      <div className="button-row"><button className="secondary-button" disabled={loading} onClick={() => void reload()}>Actualizar</button><button id="new-product" onClick={() => { setMessage(''); setEditor({ product: null }) }}>+ Nuevo producto</button></div></div>
    <div className="catalog-filters"><label>Buscar<input id="product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, nombre o categoría" type="search" /></label>
      <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas las categorías</option>{CATEGORIES.map((value, index) => <option key={value} value={value}>{index + 1}. {value}</option>)}{unclassified.length > 0 && <option>Por clasificar</option>}</select></label></div>
    {message && <p className="form-success" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p className="catalog-empty" role="status">Cargando inventario…</p> : groups.length ? <>
      <p className="field-help">Despliega cada categoría para ver sus productos. Selecciona un nombre para editarlo.</p>
      <div className="inventory-groups">{groups.map((group) => <details className="inventory-group" key={group.name} data-category={group.name} open={openedCategory === group.name || Boolean(search.trim() || category)}>
        <summary><span>{group.number > 0 ? `${group.number}. ` : ''}{group.name}</span><span className="category-count">{group.products.length} {group.products.length === 1 ? 'producto' : 'productos'}</span></summary>
        <div className="category-toolbar">{group.number > 0 ? <><p className="field-help">{group.products.length ? `Productos de ${group.name}` : 'Todavía no hay productos en esta categoría.'}</p><button type="button" className="secondary-button" data-action="add-category-product" onClick={() => { setMessage(''); setEditor({ product: null, category: group.name }) }}>+ Agregar producto</button></> : <p className="field-help">Selecciona cada producto y asígnale una de las ocho categorías actuales.</p>}</div>
        {group.products.length > 0 && <>
        <div className="inventory-scroll" role="region" aria-label={`Inventario de ${group.name}`} tabIndex={0}>
          <table className="inventory-table"><caption className="visually-hidden">Productos de {group.name}</caption>
            <thead><tr><th scope="col">ID</th><th scope="col">Nombre</th><th scope="col">Categoría</th><th scope="col" className="numeric-cell">Precio</th><th scope="col" className="numeric-cell">Cantidad vendida</th><th scope="col" className="numeric-cell">Cantidad restante</th></tr></thead>
            <tbody>{group.products.map((product) => <tr key={product.id} data-product-id={product.id}>
              <td className="inventory-id" title={product.id}>{product.id.slice(0, 8).toUpperCase()}</td>
              <td><div className="inventory-name-actions"><div><button type="button" className="product-name-button" data-action="edit" onClick={() => { setMessage(''); setEditor({ product }) }} aria-label={`Editar ${displayName(product.name)}`}>{displayName(product.name)}</button>{packageLabel(product) && <small className="product-package">{packageLabel(product)}</small>}{requiresVolume(canonicalCategory(product.category) || '') && !product.volumeMl && <small className="product-package">Selecciona una presentación</small>}</div><button type="button" className="delete-product-button" data-action="delete" aria-label={`Eliminar ${displayName(product.name)}`} onClick={() => { setMessage(''); setDeleteError(''); setDeletion({ product, operation: crypto.randomUUID() }) }}>Eliminar</button></div></td>
              <td>{canonicalCategory(product.category) || product.category || 'Por clasificar'}</td>
              <td className="numeric-cell inventory-price">{product.unitPriceMinor !== null && <div>{money(product.unitPriceMinor)}{product.shotPriceMinor !== null && <small> / unidad</small>}</div>}{product.shotPriceMinor !== null && <div>{money(product.shotPriceMinor)}<small> / shot</small></div>}<button type="button" className="restock-button" data-action="edit-price" aria-label={`Editar precio de ${displayName(product.name)}`} onClick={() => { setMessage(''); setEditor({ product }) }}>Editar precio</button></td>
              <td className="numeric-cell">{product.quantitySold.toLocaleString('es-CO')}</td>
              <td className={`numeric-cell ${product.quantityRemaining === 0 ? 'stock-empty' : product.quantityRemaining < 15 ? 'stock-low' : ''}`}><span data-quantity="remaining">{product.quantityRemaining.toLocaleString('es-CO')}</span>{product.quantityRemaining > 0 && product.quantityRemaining < 15 && <small className="stock-low-label">Stock bajo</small>}<button type="button" className="restock-button" data-action="restock" aria-label={`Agregar existencias de ${displayName(product.name)}`} onClick={() => { setMessage(''); setRestock(product) }}>+ Agregar existencias</button></td>
            </tr>)}</tbody>
          </table>
        </div></>}
      </details>)}</div></>
      : <div className="catalog-empty"><span className="empty-icon" aria-hidden="true">▤</span><h2>{products.length ? 'No hay productos con estos filtros' : 'Tu inventario comienza aquí'}</h2><p>{products.length ? 'Prueba otro nombre o categoría.' : 'Agrega tu primer producto, su precio y la cantidad disponible.'}</p>{!products.length && <button onClick={() => setEditor({ product: null })}>Crear primer producto</button>}</div>}
    {editor && <ProductEditor product={editor.product} initialCategory={editor.category} onClose={() => setEditor(null)} onSave={save} />}
    {restock && <RestockEditor product={restock} onClose={() => setRestock(null)} onSaved={(product) => { upsert(product); setRestock(null); setMessage('Existencias agregadas correctamente.') }} />}
    {deletion && <Modal title="Eliminar producto" busy={deleting} onClose={() => setDeletion(null)}>
      <p>¿Eliminar <strong>{displayName(deletion.product.name)}</strong> del inventario?</p>
      <p className="form-description">Dejará de aparecer en la lista. Su historial se conservará.</p>
      {deletion.product.quantityRemaining > 0 && <p>Este producto todavía tiene <strong>{deletion.product.quantityRemaining.toLocaleString('es-CO')} unidades restantes</strong>.</p>}
      {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
      <footer className="dialog-actions"><button className="secondary-button" disabled={deleting} onClick={() => setDeletion(null)}>Cancelar</button><button id="confirm-product-delete" className="danger-button" disabled={deleting} onClick={() => void deleteProduct()}>{deleting ? 'Eliminando…' : 'Eliminar producto'}</button></footer>
    </Modal>}
  </section>
}
