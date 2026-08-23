import { describe, expect, it } from 'vitest'
import {
  canCreateContacts,
  canDeleteContacts,
  canEditContacts,
  canExportData,
} from './permissions'

describe('permisos del CRM', () => {
  it('permite edición global y creación a contact.write_all', () => {
    const user = { id: 'admin-1', permissions: ['contact.write_all'] }
    expect(canCreateContacts(user)).toBe(true)
    expect(canEditContacts(user, { executiveId: 'another-user' })).toBe(true)
  })

  it('limita al ejecutivo a su cartera, pero le permite altas propias', () => {
    const user = { id: 'exec-1', permissions: ['contact.write_assigned'] }
    expect(canCreateContacts(user)).toBe(true)
    expect(canEditContacts(user, { executiveId: 'exec-1' })).toBe(true)
    expect(canEditContacts(user, { executiveId: 'exec-2' })).toBe(false)
  })

  it('no confunde edición con exportación o eliminación', () => {
    const user = { permissions: ['contact.write_all'] }
    expect(canDeleteContacts(user)).toBe(false)
    expect(canExportData(user)).toBe(false)
  })
})
