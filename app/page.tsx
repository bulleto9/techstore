import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ProductCard from '@/components/product-card'

const CATEGORIES = ['Phones', 'Laptops', 'Tablets', 'Audio', 'Accessories']

export default async function HomePage() {
  const supabase = await createClient()
  const { data: featured } = await supabase
    .from('products')
    .select('*')
    .eq('featured', true)
    .gt('stock', 0)
    .order('created_at', { ascending: false })

  return (
    <>
      {/* Hero */}
      <div style={{
        background: '#111', color: '#fff',
        padding: '5rem 2rem', textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 0.75rem' }}>
          The Latest in Electronics
        </h1>
        <p style={{ color: '#aaa', marginBottom: '1.75rem', fontSize: '1rem' }}>
          Phones · Laptops · Accessories · Audio · Gaming
        </p>
        <Link href="/products" style={{
          background: '#fff', color: '#111',
          padding: '0.7rem 2rem', borderRadius: '4px',
          fontWeight: 700, fontSize: '0.95rem',
        }}>
          Shop Now →
        </Link>
      </div>

      {/* Category pills */}
      <div style={{
        display: 'flex', gap: '0.6rem', padding: '1.25rem 2rem',
        overflowX: 'auto', borderBottom: '1px solid var(--border)',
      }}>
        <Link href="/products" style={{
          background: '#111', color: '#fff',
          padding: '0.3rem 1rem', borderRadius: '99px', fontSize: '0.85rem', whiteSpace: 'nowrap',
        }}>All</Link>
        {CATEGORIES.map(cat => (
          <Link key={cat} href={`/products?category=${cat}`} style={{
            border: '1px solid var(--border-dark)', color: 'var(--muted)',
            padding: '0.3rem 1rem', borderRadius: '99px', fontSize: '0.85rem', whiteSpace: 'nowrap',
          }}>{cat}</Link>
        ))}
      </div>

      {/* Featured products */}
      <div style={{ padding: '2rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: '#999', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
          Featured Products
        </div>
        {featured && featured.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '1rem',
          }}>
            {featured.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)' }}>No featured products yet. Add some in your Supabase dashboard.</p>
        )}
      </div>
    </>
  )
}
