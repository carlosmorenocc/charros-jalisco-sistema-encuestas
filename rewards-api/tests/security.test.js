import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/security.js';

test('scrypt genera y verifica contraseñas con el costo configurado', async () => {
  const password = 'Una-clave-temporal-segura-2026';
  const pepper = 'pepper-de-prueba-con-mas-de-32-caracteres';
  const encoded = await hashPassword(password, pepper);

  assert.match(encoded, /^scrypt\$v=1\$n=32768,r=8,p=2,l=64\$/);
  assert.equal(await verifyPassword(password, encoded, pepper), true);
  assert.equal(await verifyPassword(`${password}!`, encoded, pepper), false);
});
