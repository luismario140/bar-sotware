export function AuthFeedback({ error, remaining }: { error: string; remaining: number }) {
  if (!error) return null
  return <p className="form-error" role="alert">{error}{remaining > 0 && <span> Vuelve a intentarlo en {remaining} s.</span>}</p>
}
