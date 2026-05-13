/**
 * @jest-environment node
 */
import { POST } from '@/app/api/checkout/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))
jest.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: jest.fn(),
    },
  },
}))

import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>
const mockPaymentIntents = stripe.paymentIntents.create as jest.MockedFunction<typeof stripe.paymentIntents.create>

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/checkout', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)

    const res = await POST(makeRequest({ items: [], shippingAddress: {} }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when items array is empty', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    } as any)

    const res = await POST(makeRequest({ items: [], shippingAddress: { full_name: 'Jane' } }))
    expect(res.status).toBe(400)
  })

  it('returns clientSecret when authenticated with valid items', async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: { stock: 10, name: 'iPhone' } })
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: mockFrom,
    } as any)
    mockPaymentIntents.mockResolvedValue({ client_secret: 'pi_test_secret_xyz' } as any)

    const res = await POST(makeRequest({
      items: [{ product_id: 'p1', name: 'iPhone', price: 999, quantity: 1 }],
      shippingAddress: { full_name: 'Jane', address: '1 Main St', city: 'NYC', country: 'US' },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.clientSecret).toBe('pi_test_secret_xyz')
  })
})
