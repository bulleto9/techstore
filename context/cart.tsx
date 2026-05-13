'use client'
import { createContext, useContext, useEffect, useReducer, ReactNode } from 'react'

export type CartItem = {
  id: string
  name: string
  price: number
  image_url: string
  quantity: number
}

type CartAction =
  | { type: 'ADD'; item: Omit<CartItem, 'quantity'> }
  | { type: 'REMOVE'; id: string }
  | { type: 'UPDATE_QTY'; id: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'LOAD'; items: CartItem[] }

type CartContextType = {
  items: CartItem[]
  count: number
  total: number
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
}

function cartReducer(items: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case 'ADD': {
      const existing = items.find(i => i.id === action.item.id)
      if (existing) {
        return items.map(i =>
          i.id === action.item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...items, { ...action.item, quantity: 1 }]
    }
    case 'REMOVE':
      return items.filter(i => i.id !== action.id)
    case 'UPDATE_QTY':
      return items.map(i =>
        i.id === action.id ? { ...i, quantity: action.quantity } : i
      )
    case 'CLEAR':
      return []
    case 'LOAD':
      return action.items
    default:
      return items
  }
}

const CartContext = createContext<CartContextType | null>(null)

const STORAGE_KEY = 'techstore_cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) dispatch({ type: 'LOAD', items: JSON.parse(stored) })
    } catch {}
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const count = items.reduce((sum, i) => sum + i.quantity, 0)
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <CartContext.Provider value={{
      items,
      count,
      total,
      addItem: (item) => dispatch({ type: 'ADD', item }),
      removeItem: (id) => dispatch({ type: 'REMOVE', id }),
      updateQuantity: (id, quantity) => dispatch({ type: 'UPDATE_QTY', id, quantity }),
      clearCart: () => dispatch({ type: 'CLEAR' }),
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
