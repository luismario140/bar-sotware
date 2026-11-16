export const CATEGORIES = [
  'Cervezas',
  'Aguardientes',
  'Rones',
  'Tequilas',
  'Whiskies',
  'Cócteles',
  'Bebidas sin alcohol - energizantes',
  'Bebidas preparadas mezclas',
] as const

export const searchText = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
export const canonicalCategory = (value: string) => CATEGORIES.find((category) => searchText(category) === searchText(value))
export const requiresVolume = (category: string) => category === 'Aguardientes' || category === 'Rones'
export const PACKAGES = [
  { value: 'MEDIA', name: 'Media', ml: 375 },
  { value: 'BOTELLA', name: 'Botella', ml: 750 },
  { value: 'LITRO', name: 'Litro', ml: 1000 },
] as const

export const packageLabel = (product: { packageKind: string | null; volumeMl: number | null }) =>
  product.volumeMl ? `${PACKAGES.find((item) => item.value === product.packageKind)?.name ?? ''} · ${product.volumeMl} ml` : ''
