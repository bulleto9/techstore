import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import AddToCartButton from './add-to-cart-button'

type Props = { params: Promise<{ id: string }> }

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: product } = await supabase.from('products').select('*').eq('id', id).single()

  if (!product) notFound()

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'start' }}>

        {/* Image */}
        <div style={{ background: '#f5f5f5', borderRadius: '8px', overflow: 'hidden', aspectRatio: '1', position: 'relative' }}>
          {product.image_url ? (
            <Image src={product.image_url} alt={product.name} fill style={{ objectFit: 'cover' }} sizes="450px" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '6rem' }}>📦</div>
          )}
        </div>

        {/* Info */}
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {product.brand} · {product.category}
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 1rem', letterSpacing: '-0.02em' }}>
            {product.name}
          </h1>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem' }}>
            ${product.price.toLocaleString()}
          </div>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: '2rem' }}>
            {product.description}
          </p>
          {product.stock > 0 ? (
            <AddToCartButton product={product} />
          ) : (
            <div style={{ padding: '1rem', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '6px', color: '#cc0000', fontSize: '0.9rem' }}>
              Out of stock
            </div>
          )}
          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            {product.stock} in stock
          </div>
        </div>
      </div>
    </div>
  )
}
