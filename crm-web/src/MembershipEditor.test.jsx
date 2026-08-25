import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MembershipEditor from './MembershipEditor'

const membership = {
  id: 'membership-1', membershipSection: 'VIP', seatCount: 2, rowVersion: 3,
  localityCode: 'vip', localityName: 'Palcos VIP', discountCode: 'regular', discountName: 'Sin descuento',
  units: [{ unitNumber: 1, seatIdentifier: 'V-01' }, { unitNumber: 2, seatIdentifier: 'V-02' }],
}

const pricingCatalog = {
  localities: [{ code: 'vip', displayName: 'Palcos VIP', section: 'VIP' }, { code: 'preferente', displayName: 'Central Preferente', section: 'Preferente' }, { code: 'general', displayName: 'Lateral 1RA', section: 'General' }],
  discounts: [{ code: 'regular', displayName: 'Sin descuento' }, { code: 'july25', displayName: '25% de descuento' }],
}

const quote = vi.fn(async ({ localityCode, discountCode, seatCount }) => ({ localityCode, discountCode, seatCount, listUnitPrice: 7480, commercialValue: 7480 * seatCount, netAmount: 7480 * seatCount, discountAmount: 0, chargedUnits: seatCount, bonusUnits: 0 }))

describe('editor de abonos', () => {
  it('captura sección, cantidad y una butaca obligatoria por abono', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<MembershipEditor membership={null} pricingCatalog={pricingCatalog} onQuote={quote} canEdit onSave={onSave} />)

    fireEvent.change(screen.getByLabelText(/Sección/), { target: { value: 'Preferente' } })
    fireEvent.change(screen.getByLabelText(/Localidad/), { target: { value: 'preferente' } })
    fireEvent.change(screen.getByLabelText(/Descuento o campaña/), { target: { value: 'regular' } })
    fireEvent.change(screen.getByLabelText(/Cantidad de abonos/), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/Butaca 1/), { target: { value: ' P-10 ' } })
    fireEvent.change(screen.getByLabelText(/Butaca 2/), { target: { value: 'P-11' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar abonos' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Agregar abonos' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      membershipSection: 'Preferente', localityCode: 'preferente', discountCode: 'regular', seatCount: 2,
      units: [{ unitNumber: 1, seatIdentifier: ' P-10 ' }, { unitNumber: 2, seatIdentifier: 'P-11' }],
    })
  })

  it('impide butacas vacías o repetidas y lleva el foco al primer error', async () => {
    const onSave = vi.fn()
    render(<MembershipEditor membership={null} pricingCatalog={pricingCatalog} onQuote={quote} canEdit onSave={onSave} />)
    fireEvent.change(screen.getByLabelText(/Sección/), { target: { value: 'General' } })
    fireEvent.change(screen.getByLabelText(/Localidad/), { target: { value: 'general' } })
    fireEvent.change(screen.getByLabelText(/Descuento o campaña/), { target: { value: 'regular' } })
    fireEvent.change(screen.getByLabelText(/Cantidad de abonos/), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/Butaca 1/), { target: { value: 'G-01' } })
    fireEvent.change(screen.getByLabelText(/Butaca 2/), { target: { value: ' g-01 ' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar abonos' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Agregar abonos' }))

    expect(screen.getAllByText('Cada butaca debe ser única.')).toHaveLength(2)
    await waitFor(() => expect(screen.getByLabelText(/Butaca 1/)).toHaveFocus())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('avisa antes de descartar butacas y expone una vista de solo lectura', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { rerender } = render(<MembershipEditor membership={membership} pricingCatalog={pricingCatalog} onQuote={quote} canEdit onSave={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Cantidad de abonos/), { target: { value: '1' } })
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByLabelText(/Cantidad de abonos/)).toHaveValue('2')

    rerender(<MembershipEditor membership={membership} pricingCatalog={pricingCatalog} onQuote={quote} canEdit={false} onSave={vi.fn()} />)
    expect(screen.getByText('V-01, V-02')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Guardar abonos/ })).not.toBeInTheDocument()
    confirm.mockRestore()
  })

  it('evita envíos dobles mientras la membresía se está guardando', async () => {
    const onSave = vi.fn(() => new Promise(() => {}))
    render(<MembershipEditor membership={membership} pricingCatalog={pricingCatalog} onQuote={quote} canEdit onSave={onSave} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar abonos' })).toBeEnabled())
    const save = screen.getByRole('button', { name: 'Guardar abonos' })
    fireEvent.click(save)
    fireEvent.click(save)

    expect(onSave).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /Guardando abonos/ })).toBeDisabled()
  })
})
