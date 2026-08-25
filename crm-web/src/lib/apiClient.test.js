import { describe, expect, it, vi } from 'vitest'
import { createApiClient, encodeQuery, resolveApiBaseUrl } from './apiClient'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('apiClient', () => {
  it('serializa filtros sin valores vacíos', () => {
    expect(encodeQuery({ search: 'Mariana', page: 2, empty: '', status: ['renewing', 'prospect'], lastChannel: 'whatsapp', sort: 'lastContact', order: 'desc' }))
      .toBe('?search=Mariana&page=2&status=renewing&status=prospect&lastChannel=whatsapp&sort=lastContact&order=desc')
  })

  it('fuerza /api/v1 same-origin en producción y permite el API local en desarrollo', () => {
    expect(resolveApiBaseUrl({ PROD: true, VITE_API_BASE_URL: '' })).toBe('/api/v1')
    expect(resolveApiBaseUrl({ PROD: true, VITE_API_BASE_URL: '/api/v1/' })).toBe('/api/v1')
    expect(() => resolveApiBaseUrl({ PROD: true, VITE_API_BASE_URL: 'https://crm.example.com/api/v1' })).toThrow(/same-origin/)
    expect(resolveApiBaseUrl({ PROD: false, VITE_API_BASE_URL: 'http://localhost:4100/api/v1/' })).toBe('http://localhost:4100/api/v1')
  })

  it('usa cookie include y CSRF en memoria para mutaciones, sin bearer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { id: '1' }, meta: {} }))
    const api = createApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf-en-memoria', fetchImpl })

    await expect(api.updateContact('1', { firstName: 'Ana' }, 7)).resolves.toEqual({ data: { id: '1' }, meta: {} })

    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/contacts/1')
    expect(options.credentials).toBe('include')
    expect(options.headers.get('X-CSRF-Token')).toBe('csrf-en-memoria')
    expect(options.headers.get('Authorization')).toBeNull()
    expect(options.headers.get('If-Match')).toBe('7')
    expect(JSON.parse(options.body)).toEqual({ firstName: 'Ana' })
  })

  it('solicita explícitamente el detalle de un contacto eliminado para restaurarlo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'deleted-1', deletedAt: '2026-08-25T00:00:00Z' } }))
    const api = createApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf', fetchImpl })

    await api.contact('deleted/1', { includeDeleted: true })

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/contacts/deleted%2F1?includeDeleted=true')
  })

  it('permite login sin CSRF y trata la primera sesión ausente como signed-out normal', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { csrfToken: 'token', user: { id: '1' } } }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, 401))
    const api = createApiClient({ baseUrl: '/api/v1', getCsrfToken: () => '', onUnauthorized, fetchImpl })

    await api.login({ email: 'admin@example.invalid', password: 'secreto-de-prueba' })
    const [, loginOptions] = fetchImpl.mock.calls[0]
    expect(loginOptions.credentials).toBe('include')
    expect(loginOptions.headers.get('X-CSRF-Token')).toBeNull()
    await expect(api.session()).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('notifica cualquier 401 posterior para limpiar el estado privado', async () => {
    const onUnauthorized = vi.fn()
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Sesión expirada.' } }, 401))
    const api = createApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf', onUnauthorized, fetchImpl })

    await expect(api.contacts({ page: 1 })).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('audita la solicitud de PDF con filtros normalizados y sin datos visibles', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const api = createApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf', fetchImpl })
    const filters = {
      season: 'LMP-2026-27',
      executiveId: 'executive-id',
      from: '2026-08-01T06:00:00.000Z',
      to: '2026-09-01T05:59:59.999Z',
    }

    await api.recordDashboardPdfRequest(filters)

    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/exports/dashboard-pdf-events')
    expect(options.method).toBe('POST')
    expect(options.headers.get('X-CSRF-Token')).toBe('csrf')
    expect(JSON.parse(options.body)).toEqual({ filters })
  })

  it('envía el alta manual atómica con idempotencia, cookie y CSRF', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { contact: { id: 'contact-id' }, replayed: false } }, 201))
    const api = createApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf', fetchImpl })
    const payload = { contact: { firstName: 'Persona', lastName: 'Sintética', email: 'persona@example.invalid' }, consent: { status: 'unknown' }, initialObservation: { notes: 'Alta de prueba.' }, membership: null }

    await api.createManualRegistration(payload, 'd375c067-ad4c-4bac-8ade-418fb50a2a40')

    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/manual-registrations')
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('include')
    expect(options.headers.get('X-CSRF-Token')).toBe('csrf')
    expect(options.headers.get('Idempotency-Key')).toBe('d375c067-ad4c-4bac-8ade-418fb50a2a40')
    expect(JSON.parse(options.body)).toEqual(payload)
  })

  it('crea y actualiza membresías con CSRF y control de versión', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'membership-1', rowVersion: 8 } }, 200))
    const api = createApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf', fetchImpl })
    const createPayload = { seasonCode: 'LMP-2026-27', membershipStatus: 'active', section: 'VIP', seatCount: 1, startDate: '2026-08-22T18:00:00.000Z', units: [{ unitNumber: 1, seatIdentifier: 'V-01' }] }
    const updatePayload = { section: 'Preferente', seatCount: 1, units: [{ unitNumber: 1, seatIdentifier: 'P-09' }] }

    await api.createMembership('contact/1', createPayload)
    await api.updateMembership('membership/1', updatePayload, 7)

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/contacts/contact%2F1/memberships')
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST')
    expect(fetchImpl.mock.calls[0][1].headers.get('X-CSRF-Token')).toBe('csrf')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(createPayload)
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/memberships/membership%2F1')
    expect(fetchImpl.mock.calls[1][1].method).toBe('PATCH')
    expect(fetchImpl.mock.calls[1][1].headers.get('If-Match')).toBe('7')
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual(updatePayload)
  })

  it('consulta el catálogo y una cotización autoritativa con query codificado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    const api = createApiClient({ baseUrl: '/api/v1', getCsrfToken: () => 'csrf', fetchImpl })

    await api.membershipPricingCatalog()
    await api.membershipPricingQuote({ localityCode: 'lateral 1ra', discountCode: 'july25', seatCount: 3 })

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/pricing/subscriptions/catalog')
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/pricing/subscriptions/quote?localityCode=lateral+1ra&discountCode=july25&seatCount=3')
    expect(fetchImpl.mock.calls[1][1].method).toBeUndefined()
  })
})
