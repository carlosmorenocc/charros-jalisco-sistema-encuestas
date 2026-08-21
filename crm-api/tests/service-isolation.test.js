import test from 'node:test';
import assert from 'node:assert/strict';
import { CrmService } from '../src/services/CrmService.js';

const EXECUTIVE_A = { id: 'executive-a', role: 'executive', permissionGrants: [] };
const EXECUTIVE_B = { id: 'executive-b', role: 'executive', permissionGrants: [] };
const ADMIN = { id: 'admin', role: 'admin', permissionGrants: [] };

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
