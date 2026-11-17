interface Props { id: string; value: string; onChange: (value: string) => void; disabled?: boolean; autoFocus?: boolean }

export function UsernameField({ id, value, onChange, disabled, autoFocus }: Props) {
  return <div className="username-field">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" /></svg>
    <input id={id} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
      placeholder="Tu nombre de usuario" value={value} onChange={(event) => onChange(event.target.value)}
      required maxLength={60} disabled={disabled} autoFocus={autoFocus} />
  </div>
}
