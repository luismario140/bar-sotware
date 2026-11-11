import { useEffect, useState } from 'react'
import { AuthError } from '../services/auth'

export function useAuthAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [until, setUntil] = useState(0)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    update()
    if (until <= Date.now()) return
    const timer = window.setInterval(() => {
      update()
      if (Date.now() >= until) window.clearInterval(timer)
    }, 500)
    return () => window.clearInterval(timer)
  }, [until])

  async function run(action: () => Promise<void>) {
    if (busy || remaining > 0) return
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo completar la operación.')
      if (failure instanceof AuthError && failure.retryAfterSeconds > 0) {
        setUntil(Date.now() + failure.retryAfterSeconds * 1000)
      }
    } finally {
      setBusy(false)
    }
  }

  return { run, busy, error, setError, remaining }
}
