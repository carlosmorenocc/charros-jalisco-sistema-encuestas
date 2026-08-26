import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../migrations/016_rename_carlos_executive_to_en_linea.sql', import.meta.url);
const historicalMigrationUrl = new URL('../migrations/007_sales_executive_profiles.sql', import.meta.url);
const repositoryUrl = new URL('../src/repositories/PgCrmRepository.js', import.meta.url);

test('renombra el perfil técnico de Carlos mediante una migración nueva e idempotente', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /SET display_name = 'EN LINEA'/);
  assert.match(migration, /lower\(email\) = 'crm\.assignment\.carlos@charrosjalisco\.com'/);
  assert.match(migration, /deleted_at IS NULL/);
  assert.match(migration, /display_name IS DISTINCT FROM 'EN LINEA'/);
});

test('conserva intacta la migración histórica de perfiles', async () => {
  const historicalMigration = await readFile(historicalMigrationUrl, 'utf8');

  assert.match(historicalMigration, /'crm\.assignment\.carlos@charrosjalisco\.com', 'Carlos'/);
});

test('la sincronización operativa mantiene el canal EN LINEA', async () => {
  const repository = await readFile(repositoryUrl, 'utf8');

  assert.match(
    repository,
    /WHEN 'crm\.assignment\.carlos@charrosjalisco\.com' THEN 'EN LINEA'/
  );
});
