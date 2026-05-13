import { createClient } from '@/lib/supabase/server'
import ProductCard from '@/components/product-card'
import Link from 'next/link'

const CATEGORIES = ['Phones', 'Laptops', 'Tablets', 'Audio', 'Accessories']

type Props = { searchParams: Promise<{ category?: string }> }

export default async function ProductsPage({ searchParams }: Props) {
  const { category } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('products').select('*').order('created_at', { ascending: false })
  if (category) query = query.eq('category', category)

  const { data: products } = await query

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>
        {category ? category : 'All Products'}
      </h1>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <Link href="/products" style={{
          background: !category ? '#111' : 'transparent',
          color: !category ? '#fff' : 'var(--muted)',
          border: '1px solid ' + (!category ? '#111' : 'var(--border-dark)'),
          padding: '0.3rem 0.9rem', borderRadius: '99px', fontSize: '0.85rem',
        }}>All</Link>
        {CATEGORIES.map(cat => (
          <Link key={cat} href={`/products?category=${cat}`} style={{
            background: category === cat ? '#111' : 'transparent',
            color: category === cat ? '#fff' : 'var(--muted)',
            border: '1px solid ' + (category === cat ? '#111' : 'var(--border-dark)'),
            padding: '0.3rem 0.9rem', borderRadius: '99px', fontSize: '0.85rem',
          }}>{cat}</Link>
        ))}
      </div>

      {products && products.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem',
        }}>
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--muted)' }}>No products in this category yet.</p>
      )}
    </div>
  )
}
