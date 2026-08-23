import test from 'node:test';
import assert from 'node:assert/strict';
import { CrmService } from '../src/services/CrmService.js';

const EXECUTIVE_A = { id: 'executive-a', role: 'executive', permissionGrants: [] };
const EXECUTIVE_B = { id: 'executive-b', role: 'executive', permissionGrants: [] };
const ADMIN = { id: 'admin', role: 'admin', permissionGrants: [] };
const SUPERVISOR = { id: 'supervisor', role: 'supervisor', permissionGrants: [] };
const DIRECTION = { id: 'direction', role: 'direction', permissionGrants: [] };

test('Ejecutivo no edita contacto de otro ejecutivo aunque el repositorio lo devuelva', async () => {
  const repository = {
    async getContact() { return { id: 'contact-b', executiveId: EXECUTIVE_B.id }; },
    async updateContact() { throw new Error('must not be called'); }
  };
  const service = new CrmService(repository);
  await assert.rejects(
    service.updateContact(EXECUTIVE_A, 'contact-b', { commercialStage: 'follow_up' }, {}, 1),
    /Solo puedes editar contactos de tu cartera/
  );
});

test('Ejecutivo no asigna una tarea a otro usuario', async () => {
  const repository = { async createTask() { throw new Error('must not be called'); } };
  const service = new CrmService(repository);
  await assert.rejects(
    service.createTask(EXECUTIVE_A, 'contact-a', {
      assignedTo: EXECUTIVE_B.id, description: 'Seguimiento', dueAt: new Date().toISOString()
    }, {}),
    /Solo puedes asignarte tareas/
  );
});

test('Ejecutivo no actualiza tarea asignada a otro ejecutivo', async () => {
  const repository = {
    async getTask() { return { id: 'task-b', assignedTo: EXECUTIVE_B.id }; },
    async updateTask() { throw new Error('must not be called'); }
  };
  const service = new CrmService(repository);
  await assert.rejects(
    service.updateTask(EXECUTIVE_A, 'task-b', { status: 'completed' }, {}, 1),
    /Tarea no encontrado|Solo puedes actualizar/
  );
});

test('alta manual es exclusivamente Admin y conserva un solo comando de repositorio', async () => {
  let calls = 0;
  const repository = {
    async createManualRegistration(data, actor, context, idempotency) {
      calls += 1;
      return { data, actor, context, idempotency };
    }
  };
  const service = new CrmService(repository);
  await assert.rejects(
    service.createManualRegistration(
      { id: 'supervisor', role: 'supervisor', permissionGrants: [] },
      { nextTask: null }, {}, {}
    ),
    /Solo el Administrador/
  );
  const result = await service.createManualRegistration(
    ADMIN, { nextTask: null }, { requestId: 'request' }, { idempotencyKey: 'key' }
  );
  assert.equal(result.actor, ADMIN);
  assert.equal(calls, 1);
});

test('edición de abonos conserva MEMBERSHIP_WRITE para Supervisor y Admin', async () => {
  const calls = [];
  const repository = {
    async updateMembership(id, data, actor, context, expectedVersion) {
      calls.push({ id, data, actor, context, expectedVersion });
      return { id, ...data, rowVersion: expectedVersion + 1 };
    }
  };
  const service = new CrmService(repository);
  const data = {
    section: 'VIP', seatCount: 1,
    units: [{ unitNumber: 1, seatIdentifier: 'A-1' }]
  };

  for (const actor of [DIRECTION, EXECUTIVE_A]) {
    await assert.rejects(
      service.updateMembership(actor, 'membership', data, {}, 1),
      /membership\.write/
    );
  }
  await service.updateMembership(SUPERVISOR, 'membership', data, {}, 1);
  await service.updateMembership(ADMIN, 'membership', data, {}, 2);
  assert.deepEqual(calls.map((call) => call.actor.role), ['supervisor', 'admin']);
});

test('catálogo y cotización requieren lectura autenticada, no permiso de escritura', async () => {
  const calls = [];
  const repository = {
    async getSubscriptionPricingCatalog() { calls.push('catalog'); return { localities: [] }; },
    async quoteSubscription(input) { calls.push(input); return input; }
  };
  const service = new CrmService(repository);
  await service.getSubscriptionPricingCatalog(DIRECTION);
  await service.quoteSubscription(EXECUTIVE_A, {
    localityCode: 'vip', discountCode: 'regular', seatCount: 1
  });
  await assert.rejects(
    service.getSubscriptionPricingCatalog({ id: 'unknown', role: 'unknown', permissionGrants: [] }),
    /contact\.read/
  );
  assert.equal(calls.length, 2);
});
