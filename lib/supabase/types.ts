export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type OrderItem = {
  product_id: string
  name: string
  price: number
  quantity: number
}

export type ShippingAddress = {
  full_name: string
  address: string
  city: string
  country: string
}

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
          name: string
          description: string
          price: number
          category: string
          brand: string
          image_url: string
          stock: number
          featured: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: { id: string; full_name: string; created_at: string }
        Insert: { id: string; full_name?: string }
        Update: { full_name?: string }
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          user_id: string
          items: OrderItem[]
          total: number
          status: 'pending' | 'paid' | 'failed'
          stripe_payment_id: string | null
          shipping_address: ShippingAddress
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at'>
        Update: { status?: 'pending' | 'paid' | 'failed'; stripe_payment_id?: string }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

export type Product = Database['public']['Tables']['products']['Row']
export type Order = Database['public']['Tables']['orders']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
