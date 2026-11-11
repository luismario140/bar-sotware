// Conservar centavos exactos incluso al editar importes próximos al límite seguro de JSON.
export function priceInput(minor: number): string {
  const value = BigInt(minor)
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`
}

export function money(minor: number): string {
  const value = BigInt(minor)
  const parts = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).formatToParts(value / 100n)
  const lastInteger = parts.map((part) => part.type).lastIndexOf('integer')
  const cents = value % 100n
  const fraction = cents === 0n ? '' : ',' + cents.toString().padStart(2, '0').replace(/0$/, '')
  return parts.map((part, index) => part.value + (index === lastInteger ? fraction : '')).join('')
}
