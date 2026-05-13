'use client'
import { useState } from 'react'
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js'
import { useRouter } from 'next/navigation'
import { useCart } from '@/context/cart'

export default function StripeForm({ orderId }: { orderId: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const { clearCart } = useCart()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setError('')

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order/${orderId}`,
      },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed. Please try again.')
      setLoading(false)
      return
    }

    clearCart()
    router.push(`/order/${orderId}`)
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && (
        <div style={{ color: '#cc0000', fontSize: '0.85rem', background: '#fff5f5', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #fecaca', marginTop: '1rem' }}>
          {error}
        </div>
      )}
      <button type="submit" disabled={!stripe || loading} style={{
        width: '100%', background: '#111', color: '#fff', border: 'none',
        padding: '0.9rem', borderRadius: '6px', fontWeight: 600, fontSize: '1rem',
        cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        marginTop: '1.25rem',
      }}>
        {loading ? 'Processing...' : 'Pay Now'}
      </button>
    </form>
  )
}
