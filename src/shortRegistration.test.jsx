import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import App from './App'

vi.mock('./components/LeadMultiStepForm', () => ({
  default: () => <section>Registro de correo en estadio</section>
}))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
})

it('habilita únicamente el registro corto de estadio con las encuestas públicas pausadas', () => {
  vi.stubEnv('VITE_PUBLIC_FORMS_ENABLED', 'false')
  vi.stubEnv('VITE_SUBSCRIBER_FORM_ENABLED', 'false')
  window.history.replaceState({}, '', '/leads')
  render(<App />)
  expect(screen.getByText('Registro de correo en estadio')).toBeInTheDocument()
  expect(screen.queryByText('Registro temporalmente no disponible')).not.toBeInTheDocument()
})

it('mantiene pausada la encuesta larga', () => {
  vi.stubEnv('VITE_PUBLIC_FORMS_ENABLED', 'false')
  window.history.replaceState({}, '', '/')
  render(<App />)
  expect(screen.getByText('Registro temporalmente no disponible')).toBeInTheDocument()
})

it('permite volver a pausar sólo el registro corto', () => {
  vi.stubEnv('VITE_LEADS_FORM_ENABLED', 'false')
  window.history.replaceState({}, '', '/leads')
  render(<App />)
  expect(screen.getByText('Registro temporalmente no disponible')).toBeInTheDocument()
})
