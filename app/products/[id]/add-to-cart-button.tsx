'use client'
import { useCart } from '@/context/cart'
import type { Product } from '@/lib/supabase/types'
import { useState } from 'react'

export default function AddToCartButton({ product }: { product: Product }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  function handleAdd() {
    addItem({ id: product.id, name: product.name, price: product.price, image_url: product.image_url })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <button onClick={handleAdd} style={{
      width: '100%', background: '#111', color: '#fff',
      border: 'none', padding: '0.9rem', borderRadius: '6px',
      fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
    }}>
      {added ? '✓ Added to Cart' : 'Add to Cart'}
    </button>
  )
}
