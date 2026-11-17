import { displayName } from '../catalog/names'
import { collectSales, visibleHistory, HISTORY_MAX_PAGES } from '../catalog/salesHistory'
import { salesWorkbook } from '../catalog/salesExport'
import { accountProduct, paymentLabel } from '../catalog/accounts'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { CATEGORIES, canonicalCategory, packageLabel, requiresVolume } from '../catalog/categories'
import { money } from '../catalog/money'
import { SavedReceipt, saleDate } from '../catalog/SavedReceipt'
import { catalogRequest, type Product, type SaleReceipt, type SalesHistory, type OpenAccount } from '../services/catalog'

interface Props { active: boolean; onBusyChange: (busy: boolean) => void }

export function SalesPage({ active, onBusyChange }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState<'register' | 'history'>('register')
  const [category, setCategory] = useState('')
  const [lines, setLines] = useState<{ id: string; quantity: string }[]>([])
  const [operation, setOperation] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saleSaved, setSaleSaved] = useState(false)
  const [history, setHistory] = useState<SalesHistory | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [selectedSale, setSelectedSale] = useState<SaleReceipt | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'' | 'EFECTIVO' | 'TRANSFERENCIA'>('')
  const [accountState, setAccountState] = useState<'ABIERTA' | 'CERRADA'>('CERRADA')
  const [accountName, setAccountName] = useState('')
  const [accounts, setAccounts] = useState<OpenAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<OpenAccount | null>(null)
  const [showAccounts, setShowAccounts] = useState(false)
  const [savedMessage, setSavedMessage] = useState('Venta guardada')
  const [noticeVersion, setNoticeVersion] = useState(0)

  useEffect(() => {
    if (!saleSaved) return
    const timeout = window.setTimeout(() => setSaleSaved(false), 3000)
    return () => window.clearTimeout(timeout)
  }, [saleSaved, noticeVersion])

  const reload = useCallback(async () => {
    setLoading(true); setLoadError('')
    try {
      const [products, accounts] = await Promise.all([catalogRequest<Product[]>('list'), catalogRequest<OpenAccount[]>('accounts')])
      setProducts(products); setAccounts(accounts)
    }
    catch (failure) { setLoadError(failure instanceof Error ? failure.message : 'No se pudieron cargar los productos.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (active) void reload() }, [active, reload])

  const loadHistory = useCallback(async (page: number) => {
    setHistoryLoading(true); setHistoryError('')
    try {
      const result = visibleHistory(await catalogRequest<SalesHistory>('sales', { page: 0 }), page)
      setHistory(result); setSelectedSale((previous) => result.sales.find((sale) => sale.id === previous?.id) ?? result.sales[0] ?? null)
    } catch (failure) { setHistoryError(failure instanceof Error ? failure.message : 'No se pudieron cargar las ventas.') }
    finally { setHistoryLoading(false) }
  }, [])
  useEffect(() => { if (active && mode === 'history') void loadHistory(historyPage) }, [active, mode, historyPage, loadHistory])

  async function exportSales() {
    if (exporting) return
    setExporting(true); setExportError('')
    try {
      const sales = await collectSales((page) => catalogRequest<SalesHistory>('sales', { page }))
      const workbook = salesWorkbook(sales)
      const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url; link.download = `AppBarPOS-ventas-${new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date())}.xlsx`
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (failure) { setExportError(failure instanceof Error ? failure.message : 'No se pudieron exportar las ventas.') }
    finally { setExporting(false) }
  }

  const change = (action: () => void) => { action(); setOperation(crypto.randomUUID()); setError(''); setSaleSaved(false) }
  const availableProducts = products.map(product => accountProduct(product, selectedAccount))
  const cart = lines.map((line) => ({ ...line, product: availableProducts.find((product) => product.id === line.id) }))
  const wholeQuantity = (value: string) => /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0
  const subtotal = (price: number | null | undefined, quantity: string) => BigInt(price ?? 0) * (wholeQuantity(quantity) ? BigInt(quantity) : 0n)
  const amountLabel = (amount: bigint) => amount <= BigInt(Number.MAX_SAFE_INTEGER) ? money(Number(amount)) : 'Fuera de rango'
  const total = cart.reduce((sum, line) => sum + subtotal(line.product?.unitPriceMinor, line.quantity), 0n)
  const valid = Boolean(paymentMethod) && cart.length > 0 && cart.length <= 100 && total <= BigInt(Number.MAX_SAFE_INTEGER) && cart.every((line) => line.product && line.product.unitPriceMinor !== null && wholeQuantity(line.quantity) && Number(line.quantity) <= line.product.quantityRemaining)

  function resetDraft() {
    setLines([]); setSelectedAccount(null); setAccountName(''); setPaymentMethod(''); setAccountState('CERRADA'); setOperation(crypto.randomUUID())
  }

  function resumeAccount(account: OpenAccount) {
    if (busy || lines.length || selectedAccount) return
    change(() => {
      setSelectedAccount(account); setLines(account.lines.map(line => ({ id: line.product.id, quantity: String(line.quantity) })))
      setAccountName(account.name ?? ''); setPaymentMethod(account.paymentMethod); setAccountState('ABIERTA'); setShowAccounts(false)
    })
  }

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
      const details = { operationId: operation, lines: cart.map((line) => ({ productId: line.id, expectedVersion: line.product!.version, quantity: Number(line.quantity) })), paymentMethod }
      if (accountState === 'ABIERTA') {
        await catalogRequest<OpenAccount>('saveAccount', { ...details, accountId: selectedAccount?.id ?? null, expectedVersion: selectedAccount?.version ?? null, name: accountName.trim() || null })
        setSavedMessage('Cuenta abierta guardada')
      } else {
        const sale = await catalogRequest<SaleReceipt>('checkout', { ...details, accountName: accountName.trim() || null, accountId: selectedAccount?.id ?? null, accountVersion: selectedAccount?.version ?? null })
        setSelectedSale(sale); setHistoryPage(0); setSavedMessage('Venta guardada')
      }
      resetDraft(); setSaleSaved(true); setNoticeVersion(value => value + 1)
      await reload()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar la venta. Puedes reintentar sin duplicarla.') }
    finally { setBusy(false); onBusyChange(false) }
  }

  const groups = CATEGORIES.filter((name) => !category || category === name).map((name) => ({ name, products: availableProducts.filter((product) => canonicalCategory(product.category) === name).sort((a, b) => a.name.localeCompare(b.name, 'es')) })).filter((group) => group.products.length > 0)

  return <section className="sales-page">
    <div className="sales-toolbar"><div className="sales-view-switch" role="group" aria-label="Vista de ventas"><button id="sale-register-tab" className={mode === 'register' && !showAccounts ? 'is-selected' : ''} disabled={busy} onClick={() => { setMode('register'); setShowAccounts(false) }}>Registrar venta</button><button id="sales-history-tab" className={mode === 'history' ? 'is-selected' : ''} disabled={busy} onClick={() => setMode('history')}>Ventas guardadas</button><button id="open-accounts-toggle" type="button" className={mode === 'register' && showAccounts ? 'is-selected' : ''} disabled={busy || loading} aria-expanded={mode === 'register' && showAccounts} onClick={() => { setMode('register'); setShowAccounts(mode === 'history' || !showAccounts) }}>Cuentas abiertas <span className="open-accounts-count">{accounts.length}</span></button></div><button id="refresh-sales" type="button" className="secondary-button sales-refresh" aria-label={mode === 'history' ? 'Actualizar ventas guardadas' : 'Actualizar productos'} title="Actualizar" aria-busy={loading || historyLoading} disabled={busy || loading || historyLoading} onClick={() => mode === 'history' ? void loadHistory(historyPage) : void reload()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17" /></svg></button></div>
    {mode === 'register' ? <>
      <p className="form-description">Selecciona productos para agregarlos al comprobante. Cada tarjeta agrega una unidad.</p>
      <div className="sales-workspace">
        <div className="sales-catalog">
          {selectedAccount && <div className="editing-account">{displayName(selectedAccount.name || `Cuenta ${selectedAccount.id.slice(0, 8).toUpperCase()}`)}</div>}
          {showAccounts && <div className="open-accounts-list">{lines.length > 0 && <p className="field-help">Guarda o vacía el comprobante actual antes de retomar otra cuenta.</p>}{accounts.length ? accounts.map(account => <div className="open-account-row" key={account.id}><button type="button" data-open-account={account.id} disabled={busy || lines.length > 0 || Boolean(selectedAccount)} onClick={() => resumeAccount(account)}><span><strong>{displayName(account.name || `Cuenta ${account.id.slice(0, 8).toUpperCase()}`)}</strong><small>Abierta · {paymentLabel(account.paymentMethod)} · {account.lines.length} productos</small></span><strong>{money(account.totalMinor)}</strong></button></div>) : <p className="field-help">No hay cuentas abiertas.</p>}</div>}
          <div className="sales-category-tabs" role="group" aria-label="Filtrar productos por categoría"><button className={!category ? 'is-selected' : ''} aria-pressed={!category} disabled={busy} onClick={() => setCategory('')}>Todas</button>{CATEGORIES.map((name) => <button key={name} aria-pressed={category === name} className={category === name ? 'is-selected' : ''} disabled={busy} onClick={() => setCategory(name)}>{name}</button>)}</div>
          {loadError && <p className="form-error" role="alert">{loadError}</p>}
          {loading ? <p className="sales-empty" role="status">Cargando productos…</p> : groups.length ? groups.map((group) => <section className="sales-category" key={group.name}><h2>{group.name}<span>{group.products.length}</span></h2><div className="sales-product-grid">{group.products.map((product) => {
            const quantity = Number(lines.find((line) => line.id === product.id)?.quantity || 0)
            const available = Math.max(0, product.quantityRemaining - quantity)
            const unavailable = available === 0
            const lowStock = available > 0 && available < 15
            const reason = blocked(product)
            return <button type="button" key={product.id} className={`sale-product-card ${quantity > 0 ? 'in-ticket' : ''} ${unavailable ? 'stock-unavailable' : ''}`} data-sale-card={product.id} aria-label={`${unavailable ? 'Sin unidades disponibles de' : 'Agregar'} ${displayName(product.name)}${packageLabel(product) ? `, ${packageLabel(product)}` : ''}`} disabled={busy || Boolean(loadError) || Boolean(reason) || unavailable} onClick={() => add(product)}>
              <span className="sale-card-top"><span className={lowStock ? 'sale-stock stock-low' : 'sale-stock'} title={lowStock ? 'Stock bajo: quedan menos de 15 unidades' : undefined}>{lowStock && <span aria-hidden="true">⚠ </span>}{unavailable ? product.quantityRemaining === 0 ? 'Agotado' : 'Todo en esta cuenta' : `${available.toLocaleString('es-CO')} disponibles`}</span>{quantity > 0 && <span className="sale-card-count">{quantity} en venta</span>}</span><strong>{displayName(product.name)}</strong><span className="sale-card-package">{packageLabel(product) || 'Por unidad'}</span><span className="sale-card-bottom"><strong>{product.unitPriceMinor === null ? 'Sin precio' : money(product.unitPriceMinor)}</strong>{!unavailable && <span className="sale-card-add" aria-hidden="true">+</span>}</span>{reason && reason !== 'Agotado' && <small>{reason}</small>}
            </button>
          })}</div></section>) : <div className="sales-empty"><h2>No hay productos para mostrar</h2><p>{category ? 'Selecciona otra categoría.' : 'Agrega productos desde Inventario para comenzar.'}</p></div>}
        </div>
        <aside className="sales-receipt" aria-label="Comprobante de la venta">
          {saleSaved && <p className="form-success sale-notice" role="status"><span aria-hidden="true">✓</span> {savedMessage}</p>}
          <form className="sale-ticket draft-ticket" onSubmit={checkout}>
            <header className="ticket-header"><span className="ticket-brand">AppBarPOS</span><h2>Comprobante de venta</h2><p className="ticket-state">{accountState === 'ABIERTA' ? 'Cuenta abierta' : 'Venta en curso'}</p><p className="ticket-reference">{saleDate(Date.now())}</p></header>
            <div className="ticket-columns"><span>Detalle / cantidad</span><span>Importe</span></div>
            <div className="ticket-items">{cart.length ? cart.map((line) => <div className="ticket-draft-line" data-sale-product={line.id} key={line.id}><div className="ticket-line-title"><strong>{displayName(line.product?.name ?? 'Producto no disponible')}</strong><button className="ticket-remove" type="button" aria-label={`Quitar ${line.product?.name ?? 'producto'}`} disabled={busy} onClick={() => change(() => setLines((previous) => previous.filter((item) => item.id !== line.id)))}>×</button></div>{line.product && <small>{packageLabel(line.product) || line.product.category} · {line.product.unitPriceMinor === null ? 'Sin precio' : money(line.product.unitPriceMinor)} c/u</small>}<div className="ticket-line-controls"><div className="ticket-quantity"><button type="button" disabled={busy} aria-label={`Restar una unidad de ${line.product?.name}`} onClick={() => change(() => setLines((previous) => previous.flatMap((item) => item.id !== line.id ? [item] : Number(item.quantity) > 1 ? [{ ...item, quantity: String(Number(item.quantity) - 1) }] : [])))}>−</button><input id={`sale-quantity-${line.id}`} aria-label={`Cantidad de ${line.product?.name ?? 'producto'}`} type="number" min="1" max={line.product?.quantityRemaining ?? 0} step="1" required disabled={busy} value={line.quantity} onChange={(event) => change(() => setLines((previous) => previous.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item)))} /><button type="button" disabled={busy || !line.product || Number(line.quantity) >= line.product.quantityRemaining} aria-label={`Sumar una unidad de ${line.product?.name}`} onClick={() => line.product && add(line.product)}>+</button></div><strong>{line.product ? amountLabel(subtotal(line.product.unitPriceMinor, line.quantity)) : 'No disponible'}</strong></div>{line.product && Number(line.quantity) > line.product.quantityRemaining && <p className="ticket-warning">Quedan {line.product.quantityRemaining} unidades.</p>}</div>) : <p className="ticket-empty">Agrega productos desde las tarjetas para comenzar la venta.</p>}</div>
            <p className="ticket-total" aria-live="polite">Total <strong id="sale-total">{amountLabel(total)}</strong></p>
            <div className="ticket-checkout-options">
              <fieldset disabled={busy}><legend>Método de pago</legend><div className="ticket-option-buttons"><button id="payment-cash" type="button" aria-pressed={paymentMethod === 'EFECTIVO'} onClick={() => change(() => setPaymentMethod('EFECTIVO'))}>Efectivo</button><button id="payment-transfer" type="button" aria-pressed={paymentMethod === 'TRANSFERENCIA'} onClick={() => change(() => setPaymentMethod('TRANSFERENCIA'))}>Transferencia</button></div></fieldset>
              <fieldset disabled={busy || !paymentMethod}><legend>Estado de la cuenta</legend><div className="ticket-option-buttons"><button id="account-open" type="button" aria-pressed={accountState === 'ABIERTA'} onClick={() => change(() => setAccountState('ABIERTA'))}>Abierta</button><button id="account-closed" type="button" aria-pressed={accountState === 'CERRADA'} onClick={() => change(() => setAccountState('CERRADA'))}>Cerrada</button></div></fieldset>
              <label htmlFor="sale-account-name">Nombre de cuenta <span>(opcional)</span><input id="sale-account-name" type="text" maxLength={80} value={accountName} disabled={busy} placeholder="Ej. Amigos de Mario" onChange={event => change(() => setAccountName(event.target.value))} /></label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button id="complete-sale" className="ticket-complete" type="submit" disabled={busy || loading || Boolean(loadError) || !valid}>{busy ? 'Guardando…' : accountState === 'ABIERTA' ? 'Guardar cuenta abierta' : 'Completar venta'}</button><button id="clear-sale" className="ticket-clear" type="button" disabled={busy || !lines.length} onClick={() => change(resetDraft)}>{selectedAccount ? 'Descartar cambios' : 'Vaciar comprobante'}</button>
            <div className="ticket-footer"><span className="ticket-barcode" aria-hidden="true" /><p>Venta por unidades completas · COP</p></div>
          </form>
        </aside>
      </div>
    </> : <>
      <div className="sales-history-heading"><p className="form-description">Últimas 20 ventas · 4 por página. Exporta el historial completo a Excel.</p><button id="export-sales" type="button" className="secondary-button" disabled={exporting} onClick={() => void exportSales()}>{exporting ? 'Preparando Excel…' : 'Exportar Excel'}</button>{exportError && <p className="form-error" role="alert">{exportError}</p>}</div>
      <div className="sales-workspace"><div className="sales-history-list">{historyError && <p className="form-error" role="alert">{historyError}</p>}{historyLoading ? <p role="status">Cargando ventas…</p> : history?.sales.length ? <>{history.sales.map((sale) => <button type="button" className={`history-sale ${selectedSale?.id === sale.id ? 'is-selected' : ''}`} key={sale.id} data-history-sale={sale.id} onClick={() => setSelectedSale(sale)}><span><strong>{sale.accountName ? displayName(sale.accountName) : `Venta ${sale.id.slice(0, 8).toUpperCase()}`}</strong><small>{paymentLabel(sale.paymentMethod)} · {saleDate(sale.occurredAt)} · {sale.lines.length} {sale.lines.length === 1 ? 'producto' : 'productos'}</small></span><strong>{money(sale.totalMinor)}</strong></button>)}<div className="sales-pagination"><button className="secondary-button" disabled={historyPage === 0 || historyLoading} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}>Anterior</button><span>Página {historyPage + 1} de {HISTORY_MAX_PAGES}</span><button className="secondary-button" disabled={!history.hasNext || historyLoading || historyPage >= HISTORY_MAX_PAGES - 1} onClick={() => setHistoryPage((page) => Math.min(HISTORY_MAX_PAGES - 1, page + 1))}>Siguiente</button></div></> : <p className="sales-empty">Todavía no hay ventas guardadas.</p>}</div><aside className="sales-receipt" aria-label="Detalle de la venta guardada">{selectedSale && <SavedReceipt sale={selectedSale} />}</aside></div>
    </>}
  </section>
}
