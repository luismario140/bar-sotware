import { AuthError, unwrapReply, type ApiReply } from './auth'

export interface Product {
  id: string; name: string; category: string; active: boolean; version: number
  unitPriceMinor: number | null; shotPriceMinor: number | null; imageId: string | null
}
export type CatalogOperation = 'list' | 'create' | 'update' | 'status' | 'image'
export interface ProductInput {
  operationId: string; expectedVersion: number | null; name: string; category: string
  active: boolean; unitPrice: string | null; shotPrice: string | null
  imageBase64: string | null; removeImage: boolean
}

export async function catalogRequest<T>(operation: CatalogOperation, payload?: Record<string, unknown>): Promise<T> {
  let reply: ApiReply
  try {
    if (window.appbarpos) reply = await window.appbarpos.catalog(operation, payload)
    else {
      const { id, ...body } = payload || {}
      const relative = operation === 'list' || operation === 'create' ? '/api/products'
        : `/api/products/${encodeURIComponent(String(id))}${operation === 'status' ? '/status' : operation === 'image' ? '/image' : ''}`
      const method = operation === 'list' || operation === 'image' ? 'GET' : operation === 'update' ? 'PUT' : 'POST'
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

