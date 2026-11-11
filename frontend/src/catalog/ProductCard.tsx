import { type Product } from '../services/catalog'
import { money } from './money'
import { ProductImage } from './ProductImage'

export function ProductCard({ product, onEdit, onStatus }: { product: Product; onEdit: () => void; onStatus: () => void }) {
  return <article className={`product-card ${product.active ? '' : 'product-inactive'}`} data-product-id={product.id}>
    <div className="product-picture"><ProductImage product={product} /><span className={`product-status ${product.active ? 'is-active' : ''}`}>{product.active ? 'Activo' : 'Inactivo'}</span></div>
    <div className="product-details"><p className="card-title">{product.category || 'Sin categoría'}</p><h2>{product.name}</h2>
      <div className="product-prices">{product.unitPriceMinor !== null && <p><span>Unidad</span><strong>{money(product.unitPriceMinor)}</strong></p>}{product.shotPriceMinor !== null && <p><span>Shot</span><strong>{money(product.shotPriceMinor)}</strong></p>}</div>
      <div className="product-actions"><button type="button" className="secondary-button" data-action="edit" onClick={onEdit}>Editar</button><button type="button" className="text-button" data-action="status" onClick={onStatus}>{product.active ? 'Desactivar' : 'Reactivar'}</button></div>
    </div>
  </article>
}
