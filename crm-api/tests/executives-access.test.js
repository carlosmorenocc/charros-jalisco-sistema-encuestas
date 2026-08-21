import test from 'node:test';
import assert from 'node:assert/strict';
import { CrmService } from '../src/services/CrmService.js';

test('Supervisor puede cargar la proyección mínima del selector de ejecutivos', async () => {
  const expected = [{
    id: 'executive-1',
    displayName: 'Ejecutivo Ejemplo',
    active: true
  }];
  const service = new CrmService({ async listExecutives() { return expected; } });
  const result = await service.listExecutives(
    { id: 'supervisor-1', role: 'supervisor', permissionGrants: [] },
    { active: true }
  );
  assert.deepEqual(result, expected);
  assert.deepEqual(Object.keys(result[0]).sort(), ['active', 'displayName', 'id']);
});

test('Dirección puede filtrar reportes con una proyección sin correo', async () => {
  const expected = [{ id: 'executive-1', displayName: 'Ejecutivo Ejemplo', active: true }];
  const service = new CrmService({ async listExecutives() { return expected; } });
  assert.deepEqual(
    await service.listExecutives(
      { id: 'direction-1', role: 'direction', permissionGrants: [] },
      { active: true }
    ),
    expected
  );
});

test('un actor sin lectura ni asignación no enumera ejecutivos', async () => {
  const service = new CrmService({ async listExecutives() { throw new Error('must not be called'); } });
  await assert.rejects(
    service.listExecutives({ id: 'unknown', role: 'unknown', permissionGrants: [] }, { active: true }),
    /directorio de ejecutivos/
  );
});
