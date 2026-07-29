import React from 'react'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./features/sorteos/SorteosApp', () => ({
  default: () => <main>Sorteos Charros cargado</main>
}))

describe('App routing', () => {
  const originalPath = window.location.pathname

  afterEach(() => {
    window.history.pushState({}, '', originalPath)
    vi.unstubAllEnvs()
  })

  it('carga el módulo aislado de sorteos en /sorteos', async () => {
    window.history.pushState({}, '', '/sorteos')

    render(<App />)

    expect(await screen.findByText('Sorteos Charros cargado')).toBeInTheDocument()
    expect(screen.queryByText('Aviso de privacidad:')).not.toBeInTheDocument()
  })

  it.each(['/', '/leads', '/cualquier-ruta'])(
    'mantiene cerrados los formularios públicos en %s',
    (pathname) => {
      window.history.pushState({}, '', pathname)

      render(<App />)

      expect(
        screen.getByRole('heading', { name: 'Registro temporalmente no disponible' })
      ).toBeInTheDocument()
      expect(screen.queryByText('Aviso de privacidad:')).not.toBeInTheDocument()
    }
  )
})
