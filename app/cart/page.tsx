'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useCart } from '@/context/cart'

export default function CartPage() {
  const { items, count, total, removeItem, updateQuantity } = useCart()

  if (items.length === 0) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛒</div>
        <h2 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Your cart is empty</h2>
        <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>Browse our products and add something you like.</p>
        <Link href="/products" style={{
          background: '#111', color: '#fff', padding: '0.7rem 1.5rem',
          borderRadius: '4px', fontWeight: 600, fontSize: '0.9rem',
        }}>Browse Products</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>
        Cart ({count} {count === 1 ? 'item' : 'items'})
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', gap: '1rem', alignItems: 'center',
            padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{ width: '70px', height: '70px', background: '#f5f5f5', borderRadius: '6px', position: 'relative', flexShrink: 0 }}>
              {item.image_url && (
                <Image src={item.image_url} alt={item.name} fill style={{ objectFit: 'cover', borderRadius: '6px' }} sizes="70px" />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>${item.price.toLocaleString()} each</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                style={{ width: '28px', height: '28px', border: '1px solid var(--border-dark)', borderRadius: '4px', cursor: 'pointer', background: '#fff', fontWeight: 700 }}>−</button>
              <span style={{ minWidth: '24px', textAlign: 'center', fontSize: '0.9rem' }}>{item.quantity}</span>
              <button onClick={() => updateQuantity(item.id, item.quantity + 1)}
                style={{ width: '28px', height: '28px', border: '1px solid var(--border-dark)', borderRadius: '4px', cursor: 'pointer', background: '#fff', fontWeight: 700 }}>+</button>
            </div>
            <div style={{ fontWeight: 700, minWidth: '70px', textAlign: 'right' }}>
              ${(item.price * item.quantity).toLocaleString()}
            </div>
            <button onClick={() => removeItem(item.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', padding: '0.25rem' }}>✕</button>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '1rem' }}>
          <span style={{ color: 'var(--muted)' }}>Subtotal</span>
          <span style={{ fontWeight: 700, fontSize: '1.25rem' }}>${total.toLocaleString()}</span>
        </div>
        <Link href="/checkout" style={{
          display: 'block', width: '100%', background: '#111', color: '#fff',
          textAlign: 'center', padding: '0.9rem', borderRadius: '6px',
          fontWeight: 600, fontSize: '1rem',
        }}>
          Proceed to Checkout →
        </Link>
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.75rem' }}>
          Secure checkout powered by Stripe
        </p>
      </div>
    </div>
  )
}
