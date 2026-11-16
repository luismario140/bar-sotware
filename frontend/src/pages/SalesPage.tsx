import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CATEGORIES, canonicalCategory, packageLabel, requiresVolume, searchText } from '../catalog/categories'
import { money } from '../catalog/money'
import { SavedReceipt, saleDate } from '../catalog/SavedReceipt'
import { catalogRequest, type Product, type SaleReceipt, type SalesHistory } from '../services/catalog'

interface Props { active: boolean; onBusyChange: (busy: boolean) => void }

export function SalesPage({ active, onBusyChange }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState<'register' | 'history'>('register')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<{ id: string; quantity: string }[]>([])
  const [operation, setOperation] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState<SaleReceipt | null>(null)
  const [history, setHistory] = useState<SalesHistory | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [selectedSale, setSelectedSale] = useState<SaleReceipt | null>(null)

  const reload = useCallback(async () => {
    setLoading(true); setLoadError('')
    try { setProducts(await catalogRequest<Product[]>('list')) }
    catch (failure) { setLoadError(failure instanceof Error ? failure.message : 'No se pudieron cargar los productos.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (active) void reload() }, [active, reload])

  const loadHistory = useCallback(async (page: number) => {
    setHistoryLoading(true); setHistoryError('')
    try {
      const result = await catalogRequest<SalesHistory>('sales', { page })
      setHistory(result); setSelectedSale((previous) => result.sales.find((sale) => sale.id === previous?.id) ?? result.sales[0] ?? null)
    } catch (failure) { setHistoryError(failure instanceof Error ? failure.message : 'No se pudieron cargar las ventas.') }
    finally { setHistoryLoading(false) }
  }, [])
  useEffect(() => { if (active && mode === 'history') void loadHistory(historyPage) }, [active, mode, historyPage, loadHistory])

  const change = (action: () => void) => { action(); setOperation(crypto.randomUUID()); setError(''); setCompleted(null) }
  const cart = lines.map((line) => ({ ...line, product: products.find((product) => product.id === line.id) }))
  const wholeQuantity = (value: string) => /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0
  const subtotal = (price: number | null | undefined, quantity: string) => BigInt(price ?? 0) * (wholeQuantity(quantity) ? BigInt(quantity) : 0n)
  const amountLabel = (amount: bigint) => amount <= BigInt(Number.MAX_SAFE_INTEGER) ? money(Number(amount)) : 'Fuera de rango'
  const total = cart.reduce((sum, line) => sum + subtotal(line.product?.unitPriceMinor, line.quantity), 0n)
  const valid = cart.length > 0 && cart.length <= 100 && total <= BigInt(Number.MAX_SAFE_INTEGER) && cart.every((line) => line.product && line.product.unitPriceMinor !== null && wholeQuantity(line.quantity) && Number(line.quantity) <= line.product.quantityRemaining)

  function blocked(product: Product) {
    if (!canonicalCategory(product.category)) return 'Revisa su categoría en Inventario'
    if (product.unitPriceMinor === null) return 'Configura un precio por unidad'
    if (requiresVolume(canonicalCategory(product.category) || '') && (!product.packageKind || !product.volumeMl)) return 'Configura su presentación'
    if (product.quantityRemaining < 1) return 'Agotado'
    return ''
  }

  function add(product: Product) {
    if (busy || loading || loadError || blocked(product)) return
    const current = lines.find((line) => line.id === product.id)
    if (current && Number(current.quantity) >= product.quantityRemaining) return
    change(() => setLines((previous) => current
      ? previous.map((line) => line.id === product.id ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line)
      : [...previous, { id: product.id, quantity: '1' }]))
  }

  async function checkout(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!valid || loading || loadError) { setError('Revisa las cantidades, las existencias y los precios antes de completar la venta.'); return }
    setBusy(true); onBusyChange(true); setError('')
    try {
      const sale = await catalogRequest<SaleReceipt>('checkout', { operationId: operation, lines: cart.map((line) => ({ productId: line.id, expectedVersion: line.product!.version, quantity: Number(line.quantity) })) })
      setProducts((previous) => previous.map((product) => sale.lines.find((line) => line.product.id === product.id)?.product ?? product))
      setLines([]); setOperation(crypto.randomUUID()); setCompleted(sale); setSelectedSale(sale); setHistoryPage(0)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar la venta. Puedes reintentar sin duplicarla.') }
    finally { setBusy(false); onBusyChange(false) }
  }

  const groups = CATEGORIES.filter((name) => !category || category === name).map((name) => ({ name, products: products.filter((product) => canonicalCategory(product.category) === name && searchText(`${product.name} ${product.category} ${packageLabel(product)}`).includes(searchText(search))).sort((a, b) => a.name.localeCompare(b.name, 'es')) })).filter((group) => group.products.length > 0)

  return <section className="sales-page">
    <div className="sales-toolbar"><div className="sales-view-switch" role="group" aria-label="Vista de ventas"><button id="sale-register-tab" className={mode === 'register' ? 'is-selected' : ''} disabled={busy} onClick={() => setMode('register')}>Registrar venta</button><button id="sales-history-tab" className={mode === 'history' ? 'is-selected' : ''} disabled={busy} onClick={() => setMode('history')}>Ventas guardadas</button></div><button id="refresh-sales" className="secondary-button" disabled={busy || loading || historyLoading} onClick={() => mode === 'history' ? void loadHistory(historyPage) : void reload()}>Actualizar</button></div>
    {mode === 'register' ? <>
      <p className="form-description">Selecciona productos para agregarlos al comprobante. Cada tarjeta agrega una unidad.</p>
      <div className="sales-workspace">
        <div className="sales-catalog">
          <label className="sales-search" htmlFor="sale-search">Buscar producto<input id="sale-search" type="search" placeholder="Nombre, categoría o presentación" value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} /></label>
          <div className="sales-category-tabs" role="group" aria-label="Filtrar productos por categoría"><button className={!category ? 'is-selected' : ''} aria-pressed={!category} disabled={busy} onClick={() => setCategory('')}>Todas</button>{CATEGORIES.map((name) => <button key={name} aria-pressed={category === name} className={category === name ? 'is-selected' : ''} disabled={busy} onClick={() => setCategory(name)}>{name}</button>)}</div>
          {loadError && <p className="form-error" role="alert">{loadError}</p>}
          {loading ? <p className="sales-empty" role="status">Cargando productos…</p> : groups.length ? groups.map((group) => <section className="sales-category" key={group.name}><h2>{group.name}<span>{group.products.length}</span></h2><div className="sales-product-grid">{group.products.map((product) => {
            const quantity = Number(lines.find((line) => line.id === product.id)?.quantity || 0)
            const reason = blocked(product)
            return <button type="button" key={product.id} className={`sale-product-card ${quantity > 0 ? 'in-ticket' : ''}`} data-sale-card={product.id} aria-label={`Agregar ${product.name}${packageLabel(product) ? `, ${packageLabel(product)}` : ''}`} disabled={busy || Boolean(loadError) || Boolean(reason) || quantity >= product.quantityRemaining} onClick={() => add(product)}>
              <span className="sale-card-top"><span>{product.quantityRemaining.toLocaleString('es-CO')} disponibles</span>{quantity > 0 && <span className="sale-card-count">{quantity} en venta</span>}</span><strong>{product.name}</strong><span className="sale-card-package">{packageLabel(product) || 'Por unidad'}</span><span className="sale-card-bottom"><strong>{product.unitPriceMinor === null ? 'Sin precio' : money(product.unitPriceMinor)}</strong><span className="sale-card-add" aria-hidden="true">+</span></span>{reason && <small>{reason}</small>}
            </button>
          })}</div></section>) : <div className="sales-empty"><h2>No hay productos para mostrar</h2><p>{search || category ? 'Prueba otra categoría o búsqueda.' : 'Agrega productos desde Inventario para comenzar.'}</p></div>}
        </div>
        <aside className="sales-receipt" aria-label="Comprobante de la venta">
          {completed ? <><p className="form-success" role="status">Venta guardada. El inventario se actualizó.</p><SavedReceipt sale={completed} /><button id="start-another-sale" className="another-sale-button" onClick={() => setCompleted(null)}>Registrar otra venta</button></> : <form className="sale-ticket draft-ticket" onSubmit={checkout}>
            <header className="ticket-header"><span className="ticket-brand">AppBarPOS</span><h2>Comprobante de venta</h2><p>Venta en curso</p></header>
            <div className="ticket-items">{cart.length ? cart.map((line) => <div className="ticket-draft-line" data-sale-product={line.id} key={line.id}><div className="ticket-line-title"><strong>{line.product?.name ?? 'Producto no disponible'}</strong><button className="ticket-remove" type="button" aria-label={`Quitar ${line.product?.name ?? 'producto'}`} disabled={busy} onClick={() => change(() => setLines((previous) => previous.filter((item) => item.id !== line.id)))}>×</button></div>{line.product && <small>{packageLabel(line.product) || line.product.category} · {line.product.unitPriceMinor === null ? 'Sin precio' : money(line.product.unitPriceMinor)} c/u</small>}<div className="ticket-line-controls"><div className="ticket-quantity"><button type="button" disabled={busy} aria-label={`Restar una unidad de ${line.product?.name}`} onClick={() => change(() => setLines((previous) => previous.flatMap((item) => item.id !== line.id ? [item] : Number(item.quantity) > 1 ? [{ ...item, quantity: String(Number(item.quantity) - 1) }] : [])))}>−</button><input id={`sale-quantity-${line.id}`} aria-label={`Cantidad de ${line.product?.name ?? 'producto'}`} type="number" min="1" max={line.product?.quantityRemaining ?? 0} step="1" required disabled={busy} value={line.quantity} onChange={(event) => change(() => setLines((previous) => previous.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item)))} /><button type="button" disabled={busy || !line.product || Number(line.quantity) >= line.product.quantityRemaining} aria-label={`Sumar una unidad de ${line.product?.name}`} onClick={() => line.product && add(line.product)}>+</button></div><strong>{line.product ? amountLabel(subtotal(line.product.unitPriceMinor, line.quantity)) : 'No disponible'}</strong></div>{line.product && Number(line.quantity) > line.product.quantityRemaining && <p className="ticket-warning">Quedan {line.product.quantityRemaining} unidades.</p>}</div>) : <p className="ticket-empty">Agrega productos desde las tarjetas para comenzar la venta.</p>}</div>
            <p className="ticket-total" aria-live="polite">Total <strong id="sale-total">{amountLabel(total)}</strong></p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button id="complete-sale" className="ticket-complete" type="submit" disabled={busy || loading || Boolean(loadError) || !valid}>{busy ? 'Guardando venta…' : 'Completar venta'}</button><button id="clear-sale" className="ticket-clear" type="button" disabled={busy || !lines.length} onClick={() => change(() => setLines([]))}>Vaciar comprobante</button>
            <p className="ticket-footer">Venta por unidades completas</p>
          </form>}
        </aside>
      </div>
    </> : <>
      <p className="form-description">Consulta los productos, las cantidades y el total de cada venta completada.</p>
      {historyError && <p className="form-error" role="alert">{historyError}</p>}
      <div className="sales-workspace"><div className="sales-history-list">{historyLoading ? <p role="status">Cargando ventas…</p> : history?.sales.length ? <>{history.sales.map((sale) => <button type="button" className={`history-sale ${selectedSale?.id === sale.id ? 'is-selected' : ''}`} key={sale.id} data-history-sale={sale.id} onClick={() => setSelectedSale(sale)}><span><strong>Venta {sale.id.slice(0, 8).toUpperCase()}</strong><small>{saleDate(sale.occurredAt)} · {sale.lines.length} {sale.lines.length === 1 ? 'producto' : 'productos'}</small></span><strong>{money(sale.totalMinor)}</strong></button>)}<div className="sales-pagination"><button className="secondary-button" disabled={historyPage === 0 || historyLoading} onClick={() => setHistoryPage((page) => page - 1)}>Anterior</button><span>Página {historyPage + 1}</span><button className="secondary-button" disabled={!history.hasNext || historyLoading} onClick={() => setHistoryPage((page) => page + 1)}>Siguiente</button></div></> : <p className="sales-empty">Todavía no hay ventas guardadas.</p>}</div><aside className="sales-receipt" aria-label="Detalle de la venta guardada">{selectedSale && <SavedReceipt sale={selectedSale} />}</aside></div>
    </>}
  </section>
}
