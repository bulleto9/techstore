'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      setLoading(false)
      return
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📧</div>
        <h2 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Check your email</h2>
        <p style={{ color: 'var(--muted)' }}>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then <Link href="/auth/login" style={{ color: '#111', fontWeight: 600 }}>log in</Link>.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '4rem 2rem', maxWidth: '420px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Create account</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Already have an account? <Link href="/auth/login" style={{ color: '#111', fontWeight: 600 }}>Sign in</Link>
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Full Name</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} required
            style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--border-dark)', borderRadius: '6px', fontSize: '0.95rem' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--border-dark)', borderRadius: '6px', fontSize: '0.95rem' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--border-dark)', borderRadius: '6px', fontSize: '0.95rem' }} />
        </div>
        {error && <div style={{ color: '#cc0000', fontSize: '0.85rem', background: '#fff5f5', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #fecaca' }}>{error}</div>}
        <button type="submit" disabled={loading} style={{
          background: '#111', color: '#fff', border: 'none',
          padding: '0.8rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.95rem',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
