import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import SorteosApp from './SorteosApp'

vi.mock('./lib/secureRandom', () => ({
  secureRandomIndex: vi.fn(() => 1)
}))

vi.mock('./lib/audit', async () => {
  const actual = await vi.importActual('./lib/audit')

  return {
    ...actual,
    hashRoster: vi.fn(async () => 'integration-test-roster-hash')
  }
})

describe('SorteosApp: flujo de sorteo y restablecimiento', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia
    })
  })

  it('muestra nombre y correo del ganador y permite restablecer la base completa', async () => {
    const csv = [
      'id_participante,nombre,correo',
      'P-001,Ana Gómez,ana@example.com',
      'P-002,Bruno López,bruno@example.com',
      'P-003,Carla Ruiz,carla@example.com'
    ].join('\n')
    const file = new File([csv], 'participantes-prueba.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(csv)
    })

    const { container } = render(<SorteosApp />)
    const fileInput = container.querySelector('input[type="file"]')
    const stage = screen.getByRole('region', { name: 'Escenario del sorteo' })

    expect(within(stage).getByText('Participantes').previousElementSibling)
      .toHaveTextContent('650')
    expect(within(stage).queryByText('Participantes verificados')).not.toBeInTheDocument()
    expect(within(stage).queryByText('Continúan elegibles')).not.toBeInTheDocument()
    expect(within(stage).queryByText('ESPERANDO BASE')).not.toBeInTheDocument()

    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByText('participantes-prueba.csv')).toBeInTheDocument()
    expect(within(stage).getByText('Participantes').previousElementSibling)
      .toHaveTextContent('650')
    expect(within(stage).queryByText('BASE VERIFICADA')).not.toBeInTheDocument()
    expect(within(stage).queryByText('Ana Gómez')).not.toBeInTheDocument()

    vi.useFakeTimers()
    fireEvent.click(screen.getAllByRole('button', { name: 'Iniciar sorteo' })[0])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    const winnerDialog = screen.getByRole('dialog', { name: 'Bruno López' })
    expect(winnerDialog).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bruno López' })).toBeInTheDocument()
    expect(screen.getByText('bruno@example.com')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar con el siguiente' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(stage).getByText('Participantes').previousElementSibling)
      .toHaveTextContent('650')
    expect(screen.getByRole('heading', { name: 'Ganadores' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer participantes' }))

    expect(within(stage).getByText('Participantes').previousElementSibling)
      .toHaveTextContent('650')
    expect(screen.queryByRole('heading', { name: 'Ganadores' })).not.toBeInTheDocument()
    expect(screen.getByText('participantes-prueba.csv')).toBeInTheDocument()
  })
})
