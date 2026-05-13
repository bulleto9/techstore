'use client'
import Link from 'next/link'
import { useCart } from '@/context/cart'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

export default function Nav() {
  const { count } = useCart()
  const [user, setUser] = useState<User | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.9rem 2rem',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      background: 'white',
      zIndex: 100,
    }}>
      <Link href="/" style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
        ⚡ TechStore
      </Link>

      <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', color: 'var(--muted)' }}>
        <Link href="/products">Products</Link>
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.875rem' }}>
        <Link href="/cart" style={{
          background: '#111',
          color: '#fff',
          padding: '0.3rem 0.9rem',
          borderRadius: '4px',
          fontWeight: 600,
          fontSize: '0.85rem',
        }}>
          🛒 Cart{count > 0 ? ` (${count})` : ''}
        </Link>
        {user ? (
          <>
            <Link href="/account" style={{ color: 'var(--muted)' }}>My Account</Link>
            <button onClick={handleSignOut} style={{
              background: 'none', border: '1px solid var(--border-dark)',
              padding: '0.25rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
            }}>
              Sign Out
            </button>
          </>
        ) : (
          <Link href="/auth/login" style={{ color: 'var(--muted)' }}>Login</Link>
        )}
      </div>
    </nav>
  )
}
