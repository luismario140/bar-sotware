export function displayName(value: string): string {
  return value.replace(/(^|[\s-])(\p{L})/gu, (_, separator: string, letter: string) => separator + letter.toLocaleUpperCase('es-CO'))
}
