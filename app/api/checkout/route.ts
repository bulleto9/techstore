import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'
import type { OrderItem, ShippingAddress } from '@/lib/supabase/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const items: OrderItem[] = body.items
  const shippingAddress: ShippingAddress = body.shippingAddress

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  }

  // After items empty check, before creating payment intent
  for (const item of items) {
    const { data: product } = await supabase
      .from('products')
      .select('stock, name')
      .eq('id', item.product_id)
      .single()
    if (!product || product.stock < item.quantity) {
      return NextResponse.json(
        { error: `"${item.name}" is out of stock or has insufficient quantity.` },
        { status: 409 }
      )
    }
  }

  const totalCents = Math.round(
    items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100
  )

  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: 'usd',
    metadata: {
      user_id: user.id,
      items: JSON.stringify(items),
      shipping: JSON.stringify(shippingAddress),
    },
  })

  return NextResponse.json({ clientSecret: paymentIntent.client_secret })
}
