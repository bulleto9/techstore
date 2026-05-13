import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Order } from '@/lib/supabase/types'

type Props = { params: Promise<{ id: string }> }

export default async function OrderConfirmationPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // id here is the Stripe Payment Intent ID (pi_xxx)
  // Poll briefly to handle webhook timing delay after payment
  let order = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('stripe_payment_id', id)
      .eq('user_id', user.id)
      .single()
    if (data) { order = data; break }
    if (attempt < 4) await new Promise(r => setTimeout(r, 1200))
  }

  if (!order) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2>Order not found</h2>
        <Link href="/" style={{ color: '#111', fontWeight: 600 }}>Return home</Link>
      </div>
    )
  }

  const o = order as Order

  return (
    <div style={{ padding: '4rem 2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>Order Confirmed!</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        Thank you for your purchase. Order <strong>#{o.id.slice(0, 8).toUpperCase()}</strong>
      </p>

      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', textAlign: 'left', marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: '#999', textTransform: 'uppercase', marginBottom: '1rem' }}>Items Ordered</div>
        {(o.items as { name: string; quantity: number; price: number }[]).map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
            <span>{item.name} × {item.quantity}</span>
            <span style={{ fontWeight: 600 }}>${(item.price * item.quantity).toLocaleString()}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontWeight: 700 }}>
          <span>Total</span>
          <span>${o.total.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <Link href="/account" style={{ border: '1px solid var(--border-dark)', padding: '0.6rem 1.25rem', borderRadius: '6px', fontSize: '0.9rem' }}>
          View Orders
        </Link>
        <Link href="/products" style={{ background: '#111', color: '#fff', padding: '0.6rem 1.25rem', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 600 }}>
          Continue Shopping
        </Link>
      </div>
    </div>
  )
}
