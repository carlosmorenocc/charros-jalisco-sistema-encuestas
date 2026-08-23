import { forbidden } from '../lib/errors.js';

export const ROLES = Object.freeze({
  DIRECTION: 'direction',
  EXECUTIVE: 'executive',
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin'
});

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
  DATA_EXPORT: 'data.export',
  USER_MANAGE: 'user.manage',
  PERMISSION_MANAGE: 'permission.manage',
  AUDIT_READ: 'audit.read'
});

export const DELEGABLE_PERMISSIONS = Object.freeze([
  PERMISSIONS.DATA_EXPORT,
  PERMISSIONS.CONTACT_DELETE,
  PERMISSIONS.CONTACT_RESTORE
]);

const allPermissions = Object.freeze(Object.values(PERMISSIONS));

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.DIRECTION]: Object.freeze([
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.SALES_READ
  ]),
  [ROLES.EXECUTIVE]: Object.freeze([
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.CONTACT_WRITE_ASSIGNED,
    PERMISSIONS.INTERACTION_WRITE,
    PERMISSIONS.TASK_WRITE_ASSIGNED,
    PERMISSIONS.SALES_READ
  ]),
  [ROLES.SUPERVISOR]: Object.freeze([
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.CONTACT_WRITE_ALL,
    PERMISSIONS.CONTACT_ASSIGN,
    PERMISSIONS.INTERACTION_WRITE,
    PERMISSIONS.TASK_WRITE_ALL,
    PERMISSIONS.MEMBERSHIP_WRITE,
    PERMISSIONS.SALES_READ
  ]),
  [ROLES.ADMIN]: allPermissions
});

export function effectivePermissions(actor) {
  const defaults = ROLE_PERMISSIONS[actor?.role] ?? [];
  const grants = actor?.permissionGrants ?? [];
  const denials = new Set(
    grants.filter((grant) => grant.allowed === false).map((grant) => grant.permission)
  );
  const allowed = new Set(defaults.filter((permission) => !denials.has(permission)));

  for (const grant of grants) {
    if (grant.allowed) allowed.add(grant.permission);
  }

  // Admin cannot accidentally lock itself out of critical administration.
  if (actor?.role === ROLES.ADMIN) {
    for (const permission of allPermissions) allowed.add(permission);
  }

  return allowed;
}

export function hasPermission(actor, permission) {
  return effectivePermissions(actor).has(permission);
}

export function requirePermission(actor, permission) {
  if (!hasPermission(actor, permission)) {
    throw forbidden(`Se requiere el permiso ${permission}.`);
  }
}

export function contactScope(actor) {
  return actor?.role === ROLES.EXECUTIVE ? { executiveId: actor.id } : {};
}

export function mayWriteContact(actor, contact) {
  if (hasPermission(actor, PERMISSIONS.CONTACT_WRITE_ALL)) return true;
  return hasPermission(actor, PERMISSIONS.CONTACT_WRITE_ASSIGNED)
    && contact?.executiveId === actor?.id;
}
