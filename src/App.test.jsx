import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./features/sorteos/SorteosApp', () => ({
  default: () => <main>Sorteos Charros cargado</main>
}))

vi.mock('./features/abonados/AbonadosMultiStepForm', () => ({
  default: ({ onComplete }) => <section>Formulario de abonados cargado<button type="button" onClick={onComplete}>Completar registro simulado</button></section>
}))

vi.mock('./features/abonados/admin/AbonadosCsvDownloadPage', () => ({
  default: () => <main>Exportación privada de abonados cargada</main>
}))

vi.mock('./features/registros/admin/RegistrosCsvDownloadPage', () => ({
  default: () => <main>Exportación privada del registro corto cargada</main>
}))

vi.mock('./features/registros/admin/EncuestaLargaCsvDownloadPage', () => ({
  default: () => <main>Exportación privada de la encuesta larga cargada</main>
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
      expect(screen.getByText('Tu Abono, tu hogar en Charros. ⚾🏆')).toBeInTheDocument()
      expect(screen.getByText(/personalizar cada una de tus butacas/i)).toBeInTheDocument()
      expect(screen.getByText(/indicar cuántos abonos tienes/i)).toBeInTheDocument()
      expect(screen.queryByText('Tu jersey, tu talla, tu temporada')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Compartir registro de abonados/i })).not.toBeInTheDocument()
      expect(screen.queryByText('Registro rápido')).not.toBeInTheDocument()
      expect(screen.getByText('Formulario de abonados cargado')).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Registro temporalmente no disponible' })
      ).not.toBeInTheDocument()
    }
  )

  it('oculta la descripción larga al completar el registro de abonados', () => {
    vi.stubEnv('VITE_PUBLIC_FORMS_ENABLED', 'false')
    vi.stubEnv('VITE_SUBSCRIBER_FORM_ENABLED', 'true')
    window.history.pushState({}, '', '/abonados')
    render(<App />)

    expect(screen.getByText(/personalizar cada una de tus butacas/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Completar registro simulado' }))
    expect(screen.queryByText(/personalizar cada una de tus butacas/i)).not.toBeInTheDocument()
    expect(screen.getByText('Tu Abono, tu hogar en Charros. ⚾🏆')).toBeInTheDocument()
  })

  it.each(['/admin/abonados', '/admin/abonados/'])(
    'carga la exportación privada antes del bloqueo de formularios en %s',
    (pathname) => {
      vi.stubEnv('VITE_PUBLIC_FORMS_ENABLED', 'false')
      vi.stubEnv('VITE_SUBSCRIBER_FORM_ENABLED', 'false')
      window.history.pushState({}, '', pathname)

      render(<App />)

      expect(screen.getByText('Exportación privada de abonados cargada')).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Registro temporalmente no disponible' })
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Aviso de privacidad:')).not.toBeInTheDocument()
    }
  )

  it.each(['/admin/registros', '/admin/registros/'])(
    'carga la exportación del Registro Oficial antes del bloqueo de formularios en %s',
    (pathname) => {
      vi.stubEnv('VITE_PUBLIC_FORMS_ENABLED', 'false')
      vi.stubEnv('VITE_SUBSCRIBER_FORM_ENABLED', 'false')
      window.history.pushState({}, '', pathname)

      render(<App />)

      expect(screen.getByText('Exportación privada del registro corto cargada')).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Registro temporalmente no disponible' })
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Aviso de privacidad:')).not.toBeInTheDocument()
    }
  )

  it.each(['/admin/encuesta-larga', '/admin/encuesta-larga/'])(
    'preserva la exportación separada de la encuesta larga en %s',
    (pathname) => {
      vi.stubEnv('VITE_PUBLIC_FORMS_ENABLED', 'false')
      vi.stubEnv('VITE_SUBSCRIBER_FORM_ENABLED', 'false')
      window.history.pushState({}, '', pathname)

      render(<App />)

      expect(screen.getByText('Exportación privada de la encuesta larga cargada')).toBeInTheDocument()
      expect(screen.queryByText('Exportación privada del registro corto cargada')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { name: 'Registro temporalmente no disponible' })
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Aviso de privacidad:')).not.toBeInTheDocument()
    }
  )
})
