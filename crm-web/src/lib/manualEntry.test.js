import { describe, expect, it } from 'vitest'
import { ACTIVE_SEASON, buildManualRegistrationPayload, classificationHasMembership, duplicateContactId, resizeJerseySizes } from './manualEntry'

const base = {
  firstName: '  Persona ', lastName: ' Sintética ', email: 'persona@example.invalid', phone: '', municipality: 'Guadalajara',
  subscriberStatus: 'renewing', commercialStage: 'to_contact', preferredChannel: 'whatsapp', executiveId: 'executive-id',
  businessSource: 'season_ticket_database', declaredTenureSeasons: '3', seatCount: 2, jerseySizes: ['M', 'XL'],
  startDate: '', renewalDate: '2026-10-01', zone: 'Central', product: 'Abono LMP', consentStatus: 'unknown',
  initialObservation: 'Registro manual sintético.', scheduleTask: true, taskAssignedTo: 'executive-id',
  taskDescription: 'Llamar para confirmar.', taskDueAt: '2026-09-01T10:00', taskPriority: 'high', seasonCode: ACTIVE_SEASON,
}

describe('payload de alta manual', () => {
  it('genera unidades exactas y tarea opcional sin inventar aviso de privacidad', () => {
    const payload = buildManualRegistrationPayload(base, { actorId: 'actor-id', mayAssignContact: true, mayAssignTask: true })
    expect(payload.contact).toMatchObject({ firstName: 'Persona', subscriberStatus: 'renewing', businessSource: 'season_ticket_database', declaredTenureSeasons: 3 })
    expect(payload.membership.units).toEqual([
      { unitNumber: 1, zone: 'Central', product: 'Abono LMP', jerseySize: 'M' },
      { unitNumber: 2, zone: 'Central', product: 'Abono LMP', jerseySize: 'XL' },
    ])
    expect(payload.membership).toMatchObject({ zone: 'Central', product: 'Abono LMP' })
    expect(payload.nextTask).toMatchObject({ assignedTo: 'executive-id', priority: 'high' })
    expect(payload.consent).toEqual({ status: 'unknown' })
    expect(JSON.stringify(payload)).not.toContain('privacyNoticeVersion')
  })

  it('envía prospecto sin membership ni tarea y conserva No consta', () => {
    const payload = buildManualRegistrationPayload({ ...base, subscriberStatus: 'prospect', declaredTenureSeasons: '', scheduleTask: false }, { actorId: 'actor-id', mayAssignContact: false, mayAssignTask: false })
    expect(classificationHasMembership('prospect')).toBe(false)
    expect(payload.membership).toBeNull()
    expect(payload.nextTask).toBeUndefined()
    expect(payload.contact.executiveId).toBe('actor-id')
    expect(payload.contact.declaredTenureSeasons).toBeNull()
  })

  it('limita el arreglo de tallas a 1–20 sin perder valores capturados', () => {
    expect(resizeJerseySizes(['S', 'M'], 1)).toEqual(['S'])
    expect(resizeJerseySizes(['S'], 20)).toHaveLength(20)
    expect(resizeJerseySizes([], 25)).toHaveLength(20)
  })

  it('omite tallas sin definir en lugar de inventar una selección', () => {
    const payload = buildManualRegistrationPayload({ ...base, seatCount: 1, jerseySizes: [''], scheduleTask: false }, { actorId: 'actor-id', mayAssignContact: true, mayAssignTask: true })
    expect(payload.membership.units).toEqual([{ unitNumber: 1, zone: 'Central', product: 'Abono LMP' }])
  })

  it('omite fechas residuales que no corresponden a la clasificación', () => {
    const active = buildManualRegistrationPayload({ ...base, subscriberStatus: 'current_subscriber', startDate: '2026-08-01', renewalDate: '2026-10-01' }, { actorId: 'actor-id', mayAssignContact: true, mayAssignTask: true })
    const renewing = buildManualRegistrationPayload({ ...base, subscriberStatus: 'renewing', startDate: '2026-08-01', renewalDate: '2026-10-01' }, { actorId: 'actor-id', mayAssignContact: true, mayAssignTask: true })
    const former = buildManualRegistrationPayload({ ...base, subscriberStatus: 'former_subscriber', startDate: '2026-08-01', renewalDate: '2026-10-01' }, { actorId: 'actor-id', mayAssignContact: true, mayAssignTask: true })
    expect(active.membership).toHaveProperty('startDate')
    expect(active.membership).not.toHaveProperty('renewalDate')
    expect(renewing.membership).not.toHaveProperty('startDate')
    expect(renewing.membership).toHaveProperty('renewalDate')
    expect(former.membership).not.toHaveProperty('startDate')
    expect(former.membership).not.toHaveProperty('renewalDate')
  })

  it('solo enlaza un duplicado activo inequívoco', () => {
    expect(duplicateContactId({ status: 409, code: 'DUPLICATE_CONTACT', details: { matches: [{ id: 'contact-id', deleted: false }] } })).toBe('contact-id')
    expect(duplicateContactId({ status: 409, code: 'CONFLICT', details: { matches: [{ id: 'contact-id', deleted: false }] } })).toBe('')
    expect(duplicateContactId({ status: 409, code: 'DUPLICATE_CONTACT', details: { matches: [{ id: 'one', deleted: false }, { id: 'two', deleted: false }] } })).toBe('')
    expect(duplicateContactId({ status: 409, code: 'DUPLICATE_CONTACT', details: { matches: [{ id: 'deleted-id', deleted: true }] } })).toBe('')
  })
})
