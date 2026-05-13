import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Order } from '@/lib/supabase/types'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })

  return (
    <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem' }}>My Account</h1>

      {/* Profile */}
      <div style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: '#999', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Profile</div>
        <div style={{ fontSize: '1rem', fontWeight: 600 }}>{profile?.full_name || 'No name set'}</div>
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{user.email}</div>
      </div>

      {/* Order history */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: '#999', textTransform: 'uppercase', marginBottom: '1rem' }}>Order History</div>
        {orders && orders.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {(orders as Order[]).map(order => (
              <div key={order.id} style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Order #{order.id.slice(0, 8).toUpperCase()}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                      {new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>${order.total.toLocaleString()}</div>
                    <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>✓ Paid</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {(order.items as { name: string; quantity: number; price: number }[]).map((item, i) => (
                    <div key={i}>{item.name} × {item.quantity} — ${item.price.toLocaleString()}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)' }}>No orders yet. <a href="/products" style={{ color: '#111', fontWeight: 600 }}>Start shopping →</a></p>
        )}
      </div>
    </div>
  )
}
