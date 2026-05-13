import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '@/context/cart'
import Nav from '@/components/nav'

export const metadata: Metadata = {
  title: 'TechStore — Electronics',
  description: 'The latest phones, laptops, tablets, audio, and accessories.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          <Nav />
          <main style={{ minHeight: 'calc(100vh - 60px)' }}>
            {children}
          </main>
          <footer style={{
            borderTop: '1px solid var(--border)',
            padding: '1.5rem 2rem',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--muted)',
          }}>
            © {new Date().getFullYear()} TechStore · Secure checkout powered by Stripe
          </footer>
        </CartProvider>
      </body>
    </html>
  )
}
