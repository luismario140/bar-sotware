export interface AuthState {
  configured: boolean
  authenticated: boolean
  username: string | null
}
export type AuthOperation = 'session' | 'setup' | 'login' | 'logout' | 'credentials'
export interface ApiReply { ok: boolean; status: number; body: unknown }
export class AuthError extends Error {
  constructor(public code: string, message: string, public retryAfterSeconds = 0) { super(message) }
}

export async function authRequest<T>(operation: AuthOperation, payload?: Record<string, string>): Promise<T> {
  let reply: ApiReply
  try {
    if (window.appbarpos) {
      reply = await window.appbarpos.auth(operation, payload)
    } else {
      const response = await fetch(`/api/auth/${operation}`, {
        method: operation === 'session' ? 'GET' : 'POST',
        credentials: 'same-origin', cache: 'no-store',
        headers: payload ? { 'Content-Type': 'application/json' } : {},
        body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(15000),
      })
      reply = { ok: response.ok, status: response.status, body: response.status === 204 ? null : await response.json() }
    }
  } catch {
    throw new AuthError('CONNECTION', 'No se pudo conectar con el servicio local. Verifica la conexión y vuelve a intentarlo.')
  }
  return unwrapReply<T>(reply)
}

export function unwrapReply<T>(reply: ApiReply): T {
  if (!reply.ok) {
    const body = reply.body as { code?: string; message?: string; retryAfterSeconds?: number } | null
    if (body?.code === 'UNAUTHENTICATED') window.dispatchEvent(new Event('appbarpos:session-expired'))
    throw new AuthError(body?.code || 'REQUEST_FAILED', body?.message || 'No se pudo completar la operación.', body?.retryAfterSeconds || 0)
  }
  return reply.body as T
}
