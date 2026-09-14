import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CrmService } from '../src/services/CrmService.js';

test('aprovisiona las nuevas ejecutivas como perfiles activos sin credenciales', async () => {
  const migration = await readFile(new URL('../migrations/024_add_sales_executives.sql', import.meta.url), 'utf8');
  assert.match(migration, /JULISSA CARRANZA/);
  assert.match(migration, /DANIELA VÉLAZQUEZ/);
  assert.match(migration, /'executive', true/);
  assert.doesNotMatch(migration, /local_credentials|password/i);
});

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
