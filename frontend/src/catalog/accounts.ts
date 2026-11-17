import type { OpenAccount, Product } from '../services/catalog'

export const paymentLabel = (method?: string | null) => method === 'EFECTIVO' ? 'Efectivo' : method === 'TRANSFERENCIA' ? 'Transferencia' : 'No registrado'

export function accountProduct(product: Product, account: OpenAccount | null): Product {
  const reserved = account?.lines.find(line => line.product.id === product.id)
  return reserved ? { ...product, quantityRemaining: product.quantityRemaining + reserved.quantity, unitPriceMinor: reserved.unitPriceMinor } : product
}
