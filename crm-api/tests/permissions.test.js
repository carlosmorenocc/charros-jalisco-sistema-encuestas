import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSIONS,
  effectivePermissions,
  hasPermission,
  mayWriteContact
} from '../src/security/permissions.js';

test('Dirección tiene lectura ejecutiva y no puede mutar ni exportar', () => {
  const actor = { id: 'direction-1', role: 'direction', permissionGrants: [] };
  assert.equal(hasPermission(actor, PERMISSIONS.DASHBOARD_READ), true);
  assert.equal(hasPermission(actor, PERMISSIONS.CONTACT_READ), true);
  assert.equal(hasPermission(actor, PERMISSIONS.CONTACT_WRITE_ALL), false);
  assert.equal(hasPermission(actor, PERMISSIONS.DATA_EXPORT), false);
});

test('Supervisor no exporta, borra ni restaura por defecto', () => {
  const actor = { id: 'supervisor-1', role: 'supervisor', permissionGrants: [] };
  assert.equal(hasPermission(actor, PERMISSIONS.CONTACT_WRITE_ALL), true);
  assert.equal(hasPermission(actor, PERMISSIONS.DATA_EXPORT), false);
  assert.equal(hasPermission(actor, PERMISSIONS.CONTACT_DELETE), false);
  assert.equal(hasPermission(actor, PERMISSIONS.CONTACT_RESTORE), false);
  assert.equal(hasPermission(actor, PERMISSIONS.SALES_WRITE), false);
});

test('Admin puede convertir un usuario en editor mediante concesiones granulares', () => {
  const actor = {
    id: 'supervisor-1',
    role: 'supervisor',
    permissionGrants: [
      { permission: PERMISSIONS.DATA_EXPORT, allowed: true },
      { permission: PERMISSIONS.CONTACT_DELETE, allowed: true }
    ]
  };
  assert.equal(hasPermission(actor, PERMISSIONS.DATA_EXPORT), true);
  assert.equal(hasPermission(actor, PERMISSIONS.CONTACT_DELETE), true);
  assert.equal(hasPermission(actor, PERMISSIONS.CONTACT_RESTORE), false);
});

test('Admin conserva permisos críticos aun frente a una denegación accidental', () => {
  const permissions = effectivePermissions({
    id: 'admin-1', role: 'admin', permissionGrants: [{ permission: PERMISSIONS.DATA_EXPORT, allowed: false }]
  });
  assert.equal(permissions.has(PERMISSIONS.DATA_EXPORT), true);
  assert.equal(permissions.has(PERMISSIONS.PERMISSION_MANAGE), true);
  assert.equal(permissions.has(PERMISSIONS.SALES_WRITE), true);
});

test('Ejecutivo únicamente puede escribir su propia cartera', () => {
  const actor = { id: 'executive-a', role: 'executive', permissionGrants: [] };
  assert.equal(mayWriteContact(actor, { executiveId: 'executive-a' }), true);
  assert.equal(mayWriteContact(actor, { executiveId: 'executive-b' }), false);
  assert.equal(mayWriteContact(actor, { executiveId: null }), false);
});
