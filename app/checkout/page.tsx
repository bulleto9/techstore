'use client'
import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'
import { useCart } from '@/context/cart'
import { useRouter } from 'next/navigation'
import StripeForm from '@/components/stripe-form'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function CheckoutPage() {
  const { items, total } = useCart()
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState('')
  const [orderId, setOrderId] = useState('')
  const [error, setError] = useState('')
  const [fullName, setFullName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('US')
  const [step, setStep] = useState<'shipping' | 'payment'>('shipping')

  useEffect(() => {
    if (items.length === 0) router.replace('/cart')
  }, [items, router])

  async function handleShippingSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ product_id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
        shippingAddress: { full_name: fullName, address, city, country },
      }),
    })

    if (res.status === 401) {
      router.push('/auth/login?redirect=/checkout')
      return
    }

    if (!res.ok) {
      setError('Failed to start checkout. Please try again.')
      return
    }

    const data = await res.json()
    setClientSecret(data.clientSecret)
    setOrderId(data.clientSecret.split('_secret_')[0])
    setStep('payment')
  }

  if (step === 'payment' && clientSecret) {
    return (
      <div style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Payment</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Total: <strong>${total.toLocaleString()}</strong></p>
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
          <StripeForm orderId={orderId} />
        </Elements>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Shipping</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Order total: <strong>${total.toLocaleString()}</strong></p>
      <form onSubmit={handleShippingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Full Name</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} required
            style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--border-dark)', borderRadius: '6px', fontSize: '0.95rem' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Street Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} required
            style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--border-dark)', borderRadius: '6px', fontSize: '0.95rem' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>City</label>
            <input value={city} onChange={e => setCity(e.target.value)} required
              style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--border-dark)', borderRadius: '6px', fontSize: '0.95rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Country</label>
            <select value={country} onChange={e => setCountry(e.target.value)}
              style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--border-dark)', borderRadius: '6px', fontSize: '0.95rem', background: '#fff' }}>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="SA">Saudi Arabia</option>
              <option value="AE">UAE</option>
              <option value="CA">Canada</option>
              <option value="AU">Australia</option>
            </select>
          </div>
        </div>
        {error && <div style={{ color: '#cc0000', fontSize: '0.85rem' }}>{error}</div>}
        <button type="submit" style={{
          background: '#111', color: '#fff', border: 'none',
          padding: '0.8rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer',
        }}>
          Continue to Payment →
        </button>
      </form>
    </div>
  )
}
