export interface SystemHealth {
  status: 'UP' | 'DOWN'
  application: string
  database: 'UP' | 'DOWN'
}

export async function getSystemHealth(signal?: AbortSignal): Promise<SystemHealth> {
  if (window.appbarpos) return window.appbarpos.health()
  const timeout = AbortSignal.timeout(5000)
  const response = await fetch('/api/system/health', {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('El backend no está disponible.')
  return response.json() as Promise<SystemHealth>
}
