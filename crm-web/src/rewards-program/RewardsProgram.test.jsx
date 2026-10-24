import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RewardsProgram from './RewardsProgram'

describe('RewardsProgram', () => {
  it('combina filtros, conserva la vista y registra el premio por butaca', async () => {
    render(<RewardsProgram />)
    fireEvent.change(screen.getByLabelText(/Buscar por nombre/i), { target: { value: '15803472' } })
    expect(screen.getByText('ALEJANDRA RAMÍREZ VILLASEÑOR')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Abrir perfil/i }))
    expect(screen.getByRole('heading', { name: 'ALEJANDRA RAMÍREZ VILLASEÑOR' })).toBeInTheDocument()
    expect(screen.getAllByRole('article').length).toBeGreaterThan(15)
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar cupón entregado' })[0])
    expect(screen.getByRole('alertdialog')).toHaveTextContent('VIP · 210 · F-2')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cupón registrado')
  })

  it('muestra un vacío recuperable para filtros sin resultados', () => {
    render(<RewardsProgram />)
    fireEvent.change(screen.getByLabelText(/Buscar por nombre/i), { target: { value: 'NO EXISTE' } })
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByText('ALEJANDRA RAMÍREZ VILLASEÑOR')).toBeInTheDocument()
  })
})
