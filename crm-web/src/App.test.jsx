import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App, { LoginScreen, revokeSessionSafely } from './App'

describe('CRM web en modo demostración', () => {
  it('muestra el reporte y deja claro que los datos son sintéticos', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Reporte Dirección' })).toBeInTheDocument()
    expect(await screen.findByText(/Todos los nombres y resultados visibles son sintéticos/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument()
  })

  it('integra la operación diaria dentro de Seguimiento', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Seguimiento/i }))
    expect(await screen.findByRole('heading', { name: 'Operación diaria' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Mis tareas/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Bitácora' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Vencidos y sin asignar/i })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Completar' })[0])
    expect(await screen.findByText(/La tarea se marcó como completada/i)).toBeInTheDocument()
  })

  it('registra una interacción desde el contacto con una acción real', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Cartera y Renovaciones/i }))
    expect(await screen.findByRole('columnheader', { name: 'Observaciones' })).toBeInTheDocument()
    const contactName = await screen.findByText('Mariana López')
    fireEvent.click(contactName.closest('button'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Registrar interacción', { selector: 'summary' }))
    fireEvent.change(screen.getByPlaceholderText(/Solicitó cotización/i), { target: { value: 'Solicitó información' } })
    fireEvent.change(screen.getByPlaceholderText(/Detalle verificable/i), { target: { value: 'Interacción sintética para validar el flujo.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar interacción' }))
    expect(await screen.findByText(/La interacción se registró correctamente/i)).toBeInTheDocument()
  })

  it('retira la administración de usuarios del menú local', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /^Más/i }))
    expect(screen.queryByRole('menuitem', { name: /Usuarios|permisos/i })).not.toBeInTheDocument()
  })

  it('ofrece un login accesible de correo y contraseña sin persistir credenciales', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined)
    render(<LoginScreen onLogin={onLogin} notice="La sesión expiró." />)
    expect(screen.getByRole('heading', { name: 'CRM Abonados' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('La sesión expiró.')
    fireEvent.change(screen.getByLabelText('Correo corporativo'), { target: { value: 'ADMIN@CHARROSJALISCO.COM ' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'contraseña-de-prueba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(onLogin).toHaveBeenCalledWith({ email: 'admin@charrosjalisco.com', password: 'contraseña-de-prueba' })
  })

  it('conserva la sesión si logout falla y solo la limpia tras revocación o 401', async () => {
    const clearSession = vi.fn()
    await expect(revokeSessionSafely({ logout: vi.fn().mockRejectedValue(new Error('sin red')) }, clearSession)).rejects.toThrow('sin red')
    expect(clearSession).not.toHaveBeenCalled()

    await expect(revokeSessionSafely({ logout: vi.fn().mockResolvedValue(undefined) }, clearSession)).resolves.toBe(true)
    expect(clearSession).toHaveBeenLastCalledWith('signed-out')

    const unauthorized = Object.assign(new Error('expirada'), { status: 401 })
    await expect(revokeSessionSafely({ logout: vi.fn().mockRejectedValue(unauthorized) }, clearSession)).resolves.toBe(true)
    expect(clearSession).toHaveBeenLastCalledWith('unauthorized')
  })
})
