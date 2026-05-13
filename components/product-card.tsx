'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useCart } from '@/context/cart'
import type { Product } from '@/lib/supabase/types'

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart()

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
    })
  }

  return (
    <Link href={`/products/${product.id}`} style={{
      display: 'block',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = '#ccc')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
      <div style={{ background: '#f5f5f5', height: '180px', position: 'relative' }}>
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            style={{ objectFit: 'cover' }}
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '3rem' }}>
            📦
          </div>
        )}
      </div>
      <div style={{ padding: '0.9rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
          {product.name}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          {product.brand}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700 }}>${product.price.toLocaleString()}</span>
          <button
            onClick={handleAdd}
            style={{
              background: '#111', color: '#fff',
              border: 'none', padding: '0.3rem 0.75rem',
              borderRadius: '4px', fontSize: '0.8rem',
              cursor: 'pointer', fontWeight: 600,
            }}>
            Add to Cart
          </button>
        </div>
        {product.stock === 0 && (
          <div style={{ color: '#cc0000', fontSize: '0.75rem', marginTop: '0.4rem' }}>Out of stock</div>
        )}
      </div>
    </Link>
  )
}
