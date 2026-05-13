/**
 * @jest-environment node
 */
import { POST } from '@/app/api/webhook/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null }),
      })),
    })),
    rpc: jest.fn().mockResolvedValue({ error: null }),
  })),
}))

import { stripe } from '@/lib/stripe'
const mockConstructEvent = stripe.webhooks.constructEvent as jest.MockedFunction<typeof stripe.webhooks.constructEvent>

function makeRequest(body: string, signature = 'valid-sig') {
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': signature },
  })
}

describe('POST /api/webhook', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when signature is invalid', async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error('Invalid signature') })
    const res = await POST(makeRequest('bad-body', 'bad-sig'))
    expect(res.status).toBe(400)
  })

  it('returns 200 and ignores unhandled event types', async () => {
    mockConstructEvent.mockReturnValue({ type: 'payment_intent.created', data: { object: {} } } as any)
    const res = await POST(makeRequest('{}'))
    expect(res.status).toBe(200)
  })

  it('returns 200 on payment_intent.succeeded', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test',
          amount: 99900,
          metadata: {
            user_id: 'user-1',
            items: JSON.stringify([{ product_id: 'p1', name: 'iPhone', price: 999, quantity: 1 }]),
            shipping: JSON.stringify({ full_name: 'Jane', address: '1 Main', city: 'NYC', country: 'US' }),
          },
        },
      },
    } as any)

    const res = await POST(makeRequest('{}'))
    expect(res.status).toBe(200)
  })
})
