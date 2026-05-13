import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import type { Database, OrderItem, ShippingAddress } from '@/lib/supabase/types'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as unknown as {
      id: string
      amount: number
      metadata: { user_id: string; items: string; shipping: string }
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const items: OrderItem[] = JSON.parse(pi.metadata.items)
    const shippingAddress: ShippingAddress = JSON.parse(pi.metadata.shipping)

    await supabase.from('orders').insert({
      user_id: pi.metadata.user_id,
      items,
      total: pi.amount / 100,
      status: 'paid',
      stripe_payment_id: pi.id,
      shipping_address: shippingAddress,
    })

    for (const item of items) {
      await supabase.rpc('decrement_stock', {
        product_id: item.product_id,
        amount: item.quantity,
      })
    }
  }

  return NextResponse.json({ received: true })
}
