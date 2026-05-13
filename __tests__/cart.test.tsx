import { renderHook, act } from '@testing-library/react'
import { CartProvider, useCart } from '@/context/cart'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
)

const item = { id: 'p1', name: 'iPhone', price: 999, image_url: '/img.jpg' }
const item2 = { id: 'p2', name: 'MacBook', price: 1299, image_url: '/img2.jpg' }

describe('cart context', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    expect(result.current.items).toEqual([])
    expect(result.current.count).toBe(0)
  })

  it('adds an item with quantity 1', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem(item))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(1)
    expect(result.current.count).toBe(1)
  })

  it('increments quantity when same item added twice', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem(item))
    act(() => result.current.addItem(item))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(2)
    expect(result.current.count).toBe(2)
  })

  it('removes an item', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem(item))
    act(() => result.current.removeItem('p1'))
    expect(result.current.items).toHaveLength(0)
  })

  it('updates quantity', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem(item))
    act(() => result.current.updateQuantity('p1', 5))
    expect(result.current.items[0].quantity).toBe(5)
    expect(result.current.count).toBe(5)
  })

  it('clears cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem(item))
    act(() => result.current.addItem(item2))
    act(() => result.current.clearCart())
    expect(result.current.items).toHaveLength(0)
  })

  it('calculates total correctly', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addItem(item))   // 999
    act(() => result.current.addItem(item2))  // 1299
    expect(result.current.total).toBe(2298)
  })
})
