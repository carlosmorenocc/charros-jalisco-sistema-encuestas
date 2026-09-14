import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ContactPersonalizationPanel from './ContactPersonalizationPanel'

const order = {
  saleId: 'sale-1', orderNumber: '15420000', quantity: 1, segment: 'VIP',
  seatDetails: [{ id: 'seat-1', rowVersion: 2, unitNumber: 1, seatIdentifier: 'A-22', jerseySize: '', personalization: '' }],
}

describe('personalización desde Contacto', () => {
  it('guarda nombre mayúsculo, número y jersey sobre la butaca de la orden', async () => {
    const onSave = vi.fn().mockResolvedValue({ rowVersion: 3 })
    render(<ContactPersonalizationPanel orders={[order]} canEdit onSave={onSave} />)
    fireEvent.change(screen.getByLabelText(/Nombre para butaca/), { target: { value: 'martínez' } })
    fireEvent.change(screen.getByLabelText(/Número/), { target: { value: '22' } })
    fireEvent.change(screen.getByLabelText(/Talla de jersey/), { target: { value: 'XL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar butaca' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'seat-1' }), expect.objectContaining({ personalizationName: 'MARTÍNEZ', personalizationNumber: '22', jerseySize: 'XL', rowVersion: 2 })))
  })

  it('no muestra jersey para General y explica cuando falta una orden', () => {
    const { rerender } = render(<ContactPersonalizationPanel orders={[{ ...order, segment: 'General' }]} canEdit onSave={vi.fn()} />)
    expect(screen.queryByLabelText(/Talla de jersey/)).not.toBeInTheDocument()
    rerender(<ContactPersonalizationPanel orders={[]} canEdit onSave={vi.fn()} />)
    expect(screen.getByText('Aún no tiene una orden asignada')).toBeInTheDocument()
  })
})
