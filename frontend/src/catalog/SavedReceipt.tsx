import { displayName } from './names'
import { paymentLabel } from './accounts'
import { packageLabel } from './categories'
import { money } from './money'
import type { SaleReceipt } from '../services/catalog'

export const saleDate = (time: number) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(time)

export function SavedReceipt({ sale }: { sale: SaleReceipt }) {
  return <article className="sale-ticket" data-receipt-id={sale.id}>
    <header className="ticket-header"><span className="ticket-brand">AppBarPOS</span><h2>Comprobante de venta</h2><p className="ticket-status">Venta guardada</p><p>{saleDate(sale.occurredAt)}</p><p className="ticket-reference">Registro {sale.id}</p></header>
    <div className="ticket-account-details"><p>Pago: <strong>{paymentLabel(sale.paymentMethod)}</strong></p><p>Cuenta: <strong>Cerrada</strong></p>{sale.accountName && <p>Nombre: <strong>{displayName(sale.accountName)}</strong></p>}</div>
    <div className="ticket-columns"><span>Detalle / cantidad</span><span>Importe</span></div>
    <div className="ticket-items">{sale.lines.map((line) => <div className="ticket-saved-line" key={line.product.id}><div><strong>{displayName(line.product.name)}</strong>{packageLabel(line.product) && <small>{packageLabel(line.product)}</small>}<small>{line.quantity.toLocaleString('es-CO')} × {money(line.unitPriceMinor)}</small></div><strong>{money(line.subtotalMinor)}</strong></div>)}</div>
    <p className="ticket-total">Total <strong>{money(sale.totalMinor)}</strong></p>
    <div className="ticket-footer"><span className="ticket-barcode" aria-hidden="true" /><p>Gracias por tu compra · COP</p></div>
  </article>
}
