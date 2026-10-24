export const PERMISSIONS = Object.freeze({
  DASHBOARD_READ: 'dashboard.read',
  CONTACT_READ: 'contact.read',
  CONTACT_WRITE_ASSIGNED: 'contact.write_assigned',
  CONTACT_WRITE_ALL: 'contact.write_all',
  CONTACT_ASSIGN: 'contact.assign',
  CONTACT_DELETE: 'contact.delete',
  CONTACT_RESTORE: 'contact.restore',
  INTERACTION_WRITE: 'interaction.write',
  TASK_WRITE_ASSIGNED: 'task.write_assigned',
  TASK_WRITE_ALL: 'task.write_all',
  MEMBERSHIP_WRITE: 'membership.write',
  SALES_READ: 'sales.read',
  SALES_WRITE: 'sales.write',
  EXPORT_DATA: 'data.export',
})

export function hasPermission(user, permission) {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission)
}

export function canEditContacts(user, contact) {
  if (hasPermission(user, PERMISSIONS.CONTACT_WRITE_ALL)) return true
  if (!hasPermission(user, PERMISSIONS.CONTACT_WRITE_ASSIGNED)) return false
  return contact ? contact.executiveId === user?.id : false
}

export function canCreateContacts(user) {
  return hasPermission(user, PERMISSIONS.CONTACT_WRITE_ALL)
    || hasPermission(user, PERMISSIONS.CONTACT_WRITE_ASSIGNED)
}

export function canDeleteContacts(user) {
  return hasPermission(user, PERMISSIONS.CONTACT_DELETE)
}

export function canExportData(user) {
  return hasPermission(user, PERMISSIONS.EXPORT_DATA)
}

export function canRestoreContacts(user) {
  return hasPermission(user, PERMISSIONS.CONTACT_RESTORE)
}
