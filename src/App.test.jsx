import React from 'react'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./features/sorteos/SorteosApp', () => ({
  default: () => <main>Sorteos Charros cargado</main>
}))

vi.mock('./features/abonados/AbonadosMultiStepForm', () => ({
  default: () => <section>Formulario de abonados cargado</section>
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

  it.each(['/', '/leads', '/abonados', '/abonados-lmp-26-27', '/cualquier-ruta'])(
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

  it.each(['/abonados', '/abonados-lmp-26-27'])(
    'habilita la campaña de abonados de forma independiente en %s',
    (pathname) => {
      vi.stubEnv('VITE_PUBLIC_FORMS_ENABLED', 'false')
      vi.stubEnv('VITE_SUBSCRIBER_FORM_ENABLED', 'true')
      window.history.pushState({}, '', pathname)

      render(<App />)

      expect(
        screen.getByRole('heading', { name: 'Registro de Abonados LMP 2026-2027' })
      ).toBeInTheDocument()
      expect(screen.getByText('Tu jersey, tu temporada')).toBeInTheDocument()
      expect(screen.queryByText('Tu jersey, tu talla, tu temporada')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Compartir registro de abonados/i })).not.toBeInTheDocument()
      expect(screen.queryByText('Registro rápido')).not.toBeInTheDocument()
      expect(screen.getByText('Formulario de abonados cargado')).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Registro temporalmente no disponible' })
      ).not.toBeInTheDocument()
    }
  )
})
