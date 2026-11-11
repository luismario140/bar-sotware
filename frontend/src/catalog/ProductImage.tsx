import { useEffect, useState } from 'react'
import { catalogRequest, type Product } from '../services/catalog'

export function ProductImage({ product }: { product: Product }) {
  const [image, setImage] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setImage(''); setFailed(false)
    if (product.imageId) void catalogRequest<string>('image', { id: product.id })
      .then((value) => { if (active) setImage(value) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [product.id, product.imageId])
  return image ? <img className="product-image" src={image} alt={product.name} loading="lazy" onError={() => { setImage(''); setFailed(true) }} />
    : <div className="product-placeholder" aria-label={failed ? 'Imagen no disponible' : 'Producto sin imagen'}><span>{product.name.slice(0, 2).toUpperCase()}</span><small>{failed ? 'Imagen no disponible' : product.imageId ? 'Cargando imagen…' : 'Sin imagen'}</small></div>
}
