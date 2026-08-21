import { describe, expect, it } from 'vitest'
import { fromApiContact, fromApiSale, fromApiTask, toApiContactPayload } from './dataAdapters'

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
    expect(contact.name).toBe('Persona Ejemplo')
    expect(contact.type).toBe('Por renovar')
    expect(contact.stage).toBe('Seguimiento')
    expect(contact.seats).toBe(3)
    expect(contact.seasons).toBe(5)
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
