// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('aislamiento de datos sintéticos', () => {
  it('mantiene identidades y IDs demo fuera de los módulos productivos', () => {
    const productionSources = [
      new URL('./App.jsx', import.meta.url),
      new URL('./auth/authClient.js', import.meta.url),
      new URL('./lib/apiClient.js', import.meta.url),
      new URL('./lib/dataAdapters.js', import.meta.url),
      new URL('./lib/dashboardPdf.js', import.meta.url),
    ].map((file) => readFileSync(file, 'utf8')).join('\n')

    for (const fixtureMarker of [
      'demo-executive-',
      'DEMO-',
      'demo.admin@example.invalid',
      'Mariana López',
      'Nuevos consentidos',
      'Fuente Encuesta Corta',
    ]) {
      expect(productionSources).not.toContain(fixtureMarker)
    }
  })
})
