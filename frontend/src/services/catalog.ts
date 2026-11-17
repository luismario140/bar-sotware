import { AuthError, unwrapReply, type ApiReply } from './auth'

export interface Product {
  id: string; name: string; category: string; active: boolean; version: number
  unitPriceMinor: number | null; shotPriceMinor: number | null; imageId: string | null
  quantitySold: number; quantityRemaining: number
  packageKind: string | null; volumeMl: number | null
}
export interface SaleReceipt {
  id: string; totalMinor: number; occurredAt: number
  paymentMethod?: 'EFECTIVO' | 'TRANSFERENCIA' | null; accountName?: string | null; accountId?: string | null
  lines: { product: Product; quantity: number; unitPriceMinor: number; subtotalMinor: number }[]
}
export interface OpenAccount {
  id: string; version: number; paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA'; name: string | null
  totalMinor: number; lines: SaleReceipt['lines']; createdAt: number; updatedAt: number
}
export interface AccountCancellation {
  id: string; account: OpenAccount; administratorId: number; occurredAt: number; releasedProducts: Product[]
}
export interface SalesHistory { sales: SaleReceipt[]; page: number; hasNext: boolean }
export type CatalogOperation = 'list' | 'create' | 'update' | 'status' | 'image' | 'delete' | 'restock' | 'checkout' | 'sales' | 'accounts' | 'saveAccount' | 'cancelAccount' | 'cancelledAccounts'
export interface ProductInput {
  operationId: string; expectedVersion: number | null; name: string; category: string
  active: boolean; unitPrice: string | null; shotPrice: string | null
  imageBase64: string | null; removeImage: boolean
  quantitySold: number; quantityRemaining: number
  packageKind: string | null; volumeMl: number | null
}

export async function catalogRequest<T>(operation: CatalogOperation, payload?: Record<string, unknown>): Promise<T> {
  let reply: ApiReply
  try {
    if (window.appbarpos) reply = await window.appbarpos.catalog(operation, payload)
    else {
      const { id, ...body } = payload || {}
      const relative = operation === 'cancelAccount' ? '/api/products/accounts/cancel' : operation === 'cancelledAccounts' ? '/api/products/accounts/cancellations' : operation === 'accounts' || operation === 'saveAccount' ? '/api/products/accounts' : operation === 'sales' ? `/api/products/sales?page=${encodeURIComponent(String(body.page ?? 0))}` : operation === 'checkout' ? '/api/products/sales' : operation === 'list' || operation === 'create' ? '/api/products'
        : `/api/products/${encodeURIComponent(String(id))}${operation === 'status' ? '/status' : operation === 'image' ? '/image' : operation === 'restock' ? '/restock' : ''}`
      const method = operation === 'list' || operation === 'image' || operation === 'sales' || operation === 'accounts' || operation === 'cancelledAccounts' ? 'GET' : operation === 'delete' ? 'DELETE' : operation === 'update' ? 'PUT' : 'POST'
      const response = await fetch(relative, {
        method, credentials: 'same-origin', cache: 'no-store',
        headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
        body: method !== 'GET' ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
      })
      let result: unknown
      if (operation === 'image' && response.ok) {
        result = await new Promise<string>((resolve, reject) => {
          response.blob().then((blob) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) }).catch(reject)
        })
      } else result = await response.json()
      reply = { ok: response.ok, status: response.status, body: result }
    }
  } catch { throw new AuthError('CONNECTION', 'No se pudo conectar con el catálogo. Conserva el formulario y vuelve a intentarlo.') }
  return unwrapReply<T>(reply)
}

