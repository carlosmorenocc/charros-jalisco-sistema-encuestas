import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { loadAllSales } from './App'
import { fromApiSale } from './lib/dataAdapters'

const page = (data, total, totalPages = 2) => ({ data, meta: { total, totalPages } })

describe('carga y conteo de ventas', () => {
  it('reintenta una página repetida y devuelve cada orden una sola vez', async () => {
    const meza = { id: 'meza', contactName: 'J. RAFAEL MEZA' }
    const other = { id: 'other', contactName: 'Otra persona' }
    const api = { sales: vi.fn()
      .mockResolvedValueOnce(page([meza], 2))
      .mockResolvedValueOnce(page([meza], 2))
      .mockResolvedValueOnce(page([meza], 2))
      .mockResolvedValueOnce(page([other], 2)) }
    const result = await loadAllSales(api)
    expect(result.data.map(sale => sale.id)).toEqual(['meza', 'other'])
    expect(api.sales).toHaveBeenCalledTimes(4)
    const rows = items => <table><tbody>{items.map(item => <tr key={item.id}><td>{item.contactName}</td></tr>)}</tbody></table>
    const view = render(rows(result.data))
    for (let n = 0; n < 5; n++) {
      view.rerender(rows(result.data.filter(item => item.id === 'meza')))
      expect(screen.getAllByText('J. RAFAEL MEZA')).toHaveLength(1)
      view.rerender(rows(result.data))
    }
  })

  it('no publica una lista incompleta o persistentemente duplicada', async () => {
    const api = { sales: vi.fn().mockResolvedValue(page([{ id: 'meza' }], 2)) }
    await expect(loadAllSales(api)).rejects.toThrow(/lista de ventas cambió/)
    expect(api.sales).toHaveBeenCalledTimes(4)
  })

  it('detecta cambios del total entre páginas', async () => {
    const api = { sales: vi.fn()
      .mockResolvedValueOnce(page([{ id: 'a' }], 2))
      .mockResolvedValueOnce(page([{ id: 'b' }], 3))
      .mockResolvedValueOnce(page([{ id: 'a' }], 2))
      .mockResolvedValueOnce(page([{ id: 'b' }], 2)) }
    expect((await loadAllSales(api)).data).toHaveLength(2)
  })

  it('conserva una lista vacía válida', async () => {
    const api = { sales: vi.fn().mockResolvedValue(page([], 0, 1)) }
    expect((await loadAllSales(api)).data).toEqual([])
    expect(api.sales).toHaveBeenCalledTimes(1)
  })

  it('conserva las 599 butacas y el importe al cargar tres páginas', async () => {
    const orders = Array.from({ length: 211 }, (_, n) => ({ id: String(n),
      status: 'confirmed', totalAmount: 100,
      items: [{ product: 'ABONO', quantity: n < 177 ? 3 : 2 }],
      holderAssignments: [{ quantity: n < 177 ? 3 : 2 }] }))
    const api = { sales: vi.fn(async ({ page: n }) =>
      page(orders.slice((n - 1) * 100, n * 100), 211, 3)) }
    const sales = (await loadAllSales(api)).data.map(fromApiSale)
    expect(sales.reduce((sum, sale) => sum + sale.seats, 0)).toBe(599)
    expect(sales.reduce((sum, sale) => sum + sale.total, 0)).toBe(21100)
    expect(sales.some(sale => sale.hasQuantityMismatch)).toBe(false)
  })

  it('cuenta asignaciones como Dirección, excluye estacionamientos y expone diferencias', () => {
    const sale = fromApiSale({ id: 'order', status: 'confirmed', totalAmount: 15000,
      items: [{ product: 'ABONO', quantity: 3 }, { product: 'ESTACIONAMIENTO', quantity: 2 }],
      holderAssignments: [{ quantity: 4 }] })
    expect(sale).toMatchObject({ seats: 4, itemSeatCount: 3, assignedSeatCount: 4,
      hasQuantityMismatch: true, total: 15000, parkingQuantity: 2 })
  })
})
