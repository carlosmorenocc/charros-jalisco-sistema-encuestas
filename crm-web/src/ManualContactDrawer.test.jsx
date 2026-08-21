import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ManualContactDrawer from './ManualContactDrawer'

const user = {
  id: 'admin-test-id',
  name: 'Administrador de prueba',
  permissions: ['contact.write_all', 'contact.assign', 'task.write_all'],
}

describe('alta manual', () => {
  it('valida el teléfono con la misma regla mexicana del importador', () => {
    const onSave = vi.fn()
    render(<ManualContactDrawer kind="prospect" user={user} executiveOptions={[]} onClose={vi.fn()} onSave={onSave} onOpenExisting={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Nombre\(s\)/), { target: { value: 'Persona' } })
    fireEvent.change(screen.getByLabelText(/Apellidos/), { target: { value: 'Sintética' } })
    fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: '+52 123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText(/Captura 10 dígitos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('conserva un único envío aunque se active dos veces', async () => {
    const onSave = vi.fn(() => new Promise(() => {}))
    render(<ManualContactDrawer kind="prospect" user={user} executiveOptions={[]} onClose={vi.fn()} onSave={onSave} onOpenExisting={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/Nombre\(s\)/), { target: { value: 'Persona' } })
    fireEvent.change(screen.getByLabelText(/Apellidos/), { target: { value: 'Sintética' } })
    fireEvent.change(screen.getByLabelText(/^Correo/), { target: { value: 'persona@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.change(screen.getByLabelText(/Origen comercial/), { target: { value: 'season_ticket_database' } })
    fireEvent.change(screen.getByLabelText(/Observación inicial/), { target: { value: 'Alta manual sintética.' } })
    const submit = screen.getByRole('button', { name: 'Crear registro' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][1]).toMatch(/^[0-9a-f-]{36}$/i)
    expect(screen.getByRole('button', { name: /Creando registro/ })).toBeDisabled()
  })
})
