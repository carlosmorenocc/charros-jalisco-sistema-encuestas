import { describe, expect, it } from 'vitest'
import { fromApiContact, fromApiMembership, fromApiSale, fromApiTask, membershipStatusForContact, toApiContactPayload, toApiMembershipPayload } from './dataAdapters'

describe('adaptadores de contacto', () => {
  it('convierte códigos de API en etiquetas y mantiene derivados read-only', () => {
    const contact = fromApiContact({
      id: 'contact-1',
      firstName: 'Persona',
      lastName: 'Ejemplo',
      subscriberStatus: 'renewing',
      commercialStage: 'follow_up',
      seatCount: 3,
      seasonsCount: 5,
      consentStatus: 'yes',
    })
    expect(contact.name).toBe('PERSONA EJEMPLO')
    expect(contact.type).toBe('Por renovar')
    expect(contact.stage).toBe('Seguimiento')
    expect(contact.seats).toBe(3)
    expect(contact.seasons).toBe(5)
  })

  it('normaliza el resumen de abonos sin confundir sección con municipio', () => {
    const contact = fromApiContact({
      id: 'contact-1', firstName: 'Persona', lastName: 'Ejemplo', municipality: 'Zapopan',
      subscriberStatus: 'current_subscriber', commercialStage: 'follow_up',
      membershipId: 'membership-1', membershipStatus: 'active', membershipSection: 'VIP',
      membershipSeatCount: 2, membershipSeats: ['A-12', 'A-13'], membershipRowVersion: 4,
      membershipLocalityCode: 'vip', membershipLocalityName: 'Palcos VIP', membershipDiscountCode: 'july25', membershipDiscountName: '25% julio 2026',
      membershipCommercialValue: 29920, membershipNetAmount: 22440, membershipDiscountAmount: 7480,
    })

    expect(contact.zone).toBe('Sin definir')
    expect(contact.currentMembership).toMatchObject({ id: 'membership-1', membershipSection: 'VIP', seatCount: 2, rowVersion: 4 })
    expect(contact.currentMembership.units.map((unit) => unit.seatIdentifier)).toEqual(['A-12', 'A-13'])
    expect(contact.currentMembership).toMatchObject({ localityName: 'Palcos VIP', commercialValue: 29920, netAmount: 22440, discountAmount: 7480 })
  })

  it('normaliza unidades detalladas y conserva la zona histórica separada', () => {
    const membership = fromApiMembership({
      id: 'membership-1', section: 'Preferente', seatCount: '1',
      units: [{ unitNumber: '1', seatIdentifier: 'P-09', zone: 'Central baja' }],
    })

    expect(membership.membershipSection).toBe('Preferente')
    expect(membership.units[0]).toMatchObject({ unitNumber: 1, seatIdentifier: 'P-09', zone: 'Central baja' })
  })

  it('crea y actualiza membresías con sección independiente y butacas exactas', () => {
    const draft = { membershipSection: 'General', localityCode: 'lateral_1_3', discountCode: 'july25', seatCount: 2, units: [{ seatIdentifier: ' G-01 ' }, { seatIdentifier: 'G-02' }] }
    const created = toApiMembershipPayload(draft, {
      contact: { type: 'Abonado actual' },
      today: new Date('2026-08-22T18:00:00.000Z'),
    })
    expect(created).toEqual({
      section: 'General', localityCode: 'lateral_1_3', discountCode: 'july25', seatCount: 2,
      units: [{ unitNumber: 1, seatIdentifier: 'G-01' }, { unitNumber: 2, seatIdentifier: 'G-02' }],
      seasonCode: 'LMP-2026-27', membershipStatus: 'active', startDate: '2026-08-22T18:00:00.000Z',
    })
    expect(created).not.toHaveProperty('zone')

    const updated = toApiMembershipPayload(draft, { contact: { type: 'Por renovar' }, membership: { id: 'membership-1', membershipStatus: 'renewing' } })
    expect(updated).toEqual({ section: 'General', localityCode: 'lateral_1_3', discountCode: 'july25', seatCount: 2, units: [{ unitNumber: 1, seatIdentifier: 'G-01' }, { unitNumber: 2, seatIdentifier: 'G-02' }] })
  })

  it.each([
    ['Abonado actual', 'active'], ['Abonado nuevo', 'active'], ['Por renovar', 'renewing'], ['Exabonado', 'expired'], ['Prospecto', null],
  ])('deriva %s al estado de membresía %s', (type, expected) => {
    expect(membershipStatusForContact({ type })).toBe(expected)
  })

  it('genera nombres separados y códigos del contrato al guardar', () => {
    const payload = toApiContactPayload({
      firstName: 'Persona', lastName: 'Ejemplo', email: 'persona@example.invalid', phone: '',
      municipality: 'Guadalajara', type: 'Prospecto', stage: 'Por contactar',
      preferredChannel: 'email', executiveId: '', consent: 'No consta', note: 'Dato sintético.',
    })
    expect(payload).toMatchObject({
      firstName: 'Persona',
      lastName: 'Ejemplo',
      subscriberStatus: 'prospect',
      commercialStage: 'to_contact',
      consentStatus: 'unknown',
    })
    expect(payload).not.toHaveProperty('seasonsCount')
    expect(payload).not.toHaveProperty('seatCount')
  })

  it('convierte el valor inicial Sin contactar al código aceptado por el API', () => {
    const payload = toApiContactPayload({
      firstName: 'Persona', lastName: 'Nueva', email: 'nueva@example.invalid', phone: '',
      municipality: '', type: 'Prospecto', stage: 'Sin contactar', preferredChannel: '',
      executiveId: '', consent: 'No consta', note: '',
    })

    expect(payload.commercialStage).toBe('to_contact')
  })

  it('separa el estado comercial del estado de pago y conserva partidas', () => {
    const sale = fromApiSale({
      id: 'sale-1', status: 'confirmed', totalAmount: 1000, paidAmount: 400,
      items: [{ quantity: 2, zone: 'Central' }],
    })
    expect(sale.status).toBe('Parcial')
    expect(sale.commercialStatus).toBe('Confirmada')
    expect(sale.seats).toBe(2)
    expect(sale.zone).toBe('Central')
  })

  it('marca como vencida una tarea abierta cuya fecha ya pasó', () => {
    const task = fromApiTask({
      id: 'task-1', status: 'pending', dueAt: '2020-01-01T00:00:00.000Z',
      description: 'Seguimiento', priority: 'normal',
    })
    expect(task.status).toBe('Vencida')
  })
})
