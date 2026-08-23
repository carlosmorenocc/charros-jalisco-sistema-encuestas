import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { loadSheetConfig } from '../src/config.js';
import { parseArguments } from '../src/cli.js';
import { assertUploaderIsActive } from '../src/database.js';
import { assertCommitReady, runPipeline } from '../src/pipeline.js';
import { buildSanitizedReport } from '../src/report.js';
import { buildStagingRecords } from '../src/staging-records.js';
import { validateWriteAuthorization } from '../src/write-guard.js';
import { normalizeSeasonCode } from '../src/normalize.js';
import {
  isEmptyPrefixedSharedStringsError,
  readConfiguredWorkbook,
  repairEmptyPrefixedSharedStringsInMemory
} from '../src/workbook.js';

const fixtureUrl = new URL('./fixtures/synthetic-workbook.json', import.meta.url);
const syntheticSource = { sha256: 'a'.repeat(64), bytes: 1234 };

async function createResult() {
  const [fixtureRaw, config] = await Promise.all([
    readFile(fileURLToPath(fixtureUrl), 'utf8'),
    loadSheetConfig()
  ]);
  return runPipeline({
    workbook: JSON.parse(fixtureRaw),
    source: syntheticSource,
    config,
    generatedAt: new Date('2026-08-21T12:00:00.000Z')
  });
}

test('excluye filas vacías/fórmula-only y conserva registros reales separados', async () => {
  const result = await createResult();
  assert.equal(result.sheetStats['CRM Prospectos'].rowsIgnoredFormulaOnly, 1);
  assert.equal(result.sheetStats['CRM Prospectos'].rowsAcceptedForReview, 2);
  assert.equal(result.contacts.length, 4);
  assert.equal(result.memberships.length, 1);
  assert.equal(result.membershipUnits.length, 2);
  assert.equal(result.interactions.length, 1);
  assert.equal(result.sales.length, 1);
  assert.equal(result.saleItems.length, 1);
  assert.equal(result.payments.length, 0);
  assert.equal(result.campaigns.length, 1);
  assert.equal(result.rewardDefinitions.length, 2);
  assert.equal(result.rawSaleSourceRows.length, 2);
  assert.equal(result.qualityIssues.REWARD_CONDITION_MISSING, 1);
  assert.equal(result.qualityIssues.RAW_SALE_DUPLICATE_CANDIDATE, 1);
  assert.equal(result.rawSaleSourceRows[1].resolution, 'requires_review');
  assert.ok(result.rawSaleSourceRows[1].duplicateOfSourceRecordId);
  assert.equal(result.memberships[0].seasonCode, 'LMP-2026-27');
  assert.equal(result.sales[0].seasonCode, 'LMP-2026-27');
  assert.equal(result.corrections['SEASON_VARIANT_TO_LMP-2026-27'], 2);
  assert.doesNotThrow(() => assertCommitReady(result));
  assert.equal(result.campaignMessages.length, 1);
});

test('corrige antigüedad sólo mediante las reglas controladas de encuesta larga', async () => {
  const result = await createResult();
  assert.equal(result.corrections.LONG_SURVEY_ANTIQUITY_TEXT_TO_1_3, undefined);
  assert.equal(result.corrections['LONG_SURVEY_ANTIQUITY_TEXT_TO_1-3'], 1);
  assert.equal(result.corrections['LONG_SURVEY_ANTIQUITY_TEXT_TO_4-7'], 1);
  const surveyContacts = result.contacts.filter((contact) => contact.recordType === 'survey_long');
  assert.deepEqual(surveyContacts.map((contact) => contact.metadata.antiquity), ['1-3', '4-7']);
});

test('clasifica coincidencias sin fusionar contactos automáticamente', async () => {
  const result = await createResult();
  const highConfidence = result.mergeCandidates.filter((candidate) => candidate.confidence === 'high');
  assert.ok(highConfidence.length >= 1);
  assert.ok(highConfidence.every((candidate) => candidate.reviewStatus === 'pending_review'));
  assert.equal(result.contacts.filter((contact) => contact.name === 'Ana Prueba').length, 3);
});

test('manda identidades inválidas a cuarentena y conserva su evidencia sólo para staging', async () => {
  const result = await createResult();
  assert.equal(result.quarantineReasons.CONTACT_WITHOUT_VALID_EMAIL_OR_PHONE, 1);
  const staging = buildStagingRecords(result);
  const quarantined = staging.find((record) => record.resolution === 'quarantined');
  assert.ok(quarantined);
  assert.equal(quarantined.normalizedPayload, null);
  assert.ok(JSON.stringify(quarantined.rawPayload).includes('Registro Inválido'));
});

test('el reporte sanitizado no contiene PII del fixture', async () => {
  const result = await createResult();
  const report = buildSanitizedReport(result, { mode: 'dry-run' });
  const serialized = JSON.stringify(report).toLocaleLowerCase('en-US');
  for (const forbidden of ['ana prueba', 'ana@example.test', '3312345678', 'registro inválido']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(report.piiIncluded, false);
});

test('dry-run es predeterminado y commit requiere las tres barreras', () => {
  const options = parseArguments(['--file', 'fixture.xlsx']);
  assert.equal(options.commit, false);
  assert.deepEqual(
    validateWriteAuthorization({ commit: false, sourceSha: syntheticSource.sha256 }, {}),
    { mode: 'dry-run' }
  );

  assert.throws(
    () => validateWriteAuthorization({
      commit: true,
      sourceSha: syntheticSource.sha256,
      confirmSha: syntheticSource.sha256
    }, {
      CRM_IMPORT_ENVIRONMENT: 'production',
      CRM_IMPORT_ALLOW_WRITE: 'true',
      DATABASE_URL: 'postgresql://example',
      CRM_IMPORT_UPLOADED_BY: '11111111-1111-4111-a111-111111111111'
    }),
    /WRITE_REQUIRES_STAGING_ENVIRONMENT/u
  );

  const authorization = validateWriteAuthorization({
    commit: true,
    sourceSha: syntheticSource.sha256,
    confirmSha: syntheticSource.sha256
  }, {
    CRM_IMPORT_ENVIRONMENT: 'staging',
    CRM_IMPORT_ALLOW_WRITE: 'true',
    DATABASE_URL: 'postgresql://example',
    CRM_IMPORT_UPLOADED_BY: '11111111-1111-4111-a111-111111111111'
  });
  assert.equal(authorization.mode, 'commit');
});

test('rechaza combinaciones ambiguas de CLI', () => {
  assert.throws(
    () => parseArguments(['--file', 'fixture.xlsx', '--dry-run', '--commit']),
    /DRY_RUN_AND_COMMIT_CONFLICT/u
  );
  assert.throws(
    () => parseArguments(['--file', 'fixture.xlsx', '--confirm-sha', 'a'.repeat(64)]),
    /CONFIRM_SHA_ONLY_VALID_WITH_COMMIT/u
  );
});

test('repara sólo en memoria el sharedStrings prefijado vacío y conserva fórmulas', async () => {
  const config = await loadSheetConfig();
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const sourceWorkbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    useSharedStrings: false,
    useStyles: false
  });
  const sheet = sourceWorkbook.addWorksheet('CRM Prospectos');
  sheet.addRow(['ID', 'Nombre', 'Correo', 'Teléfono']).commit();
  sheet.addRow(['CRM-SYN-001', 'Persona Sintética', 'persona@example.test', '3312345678']).commit();
  const formulaOnly = sheet.addRow([]);
  formulaOnly.getCell(1).value = { formula: '"CRM-SYN-002"', result: 'CRM-SYN-002' };
  formulaOnly.commit();
  await sourceWorkbook.commit();

  const validBuffer = Buffer.concat(chunks);
  const zip = await JSZip.loadAsync(validBuffer);
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  for (const entryPath of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) {
    const entry = zip.file(entryPath);
    if (!entry) continue;
    const xml = await entry.async('string');
    const prefixed = xml
      .replace(`xmlns="${namespace}"`, `xmlns:x="${namespace}"`)
      .replace(/<(\/?)((?!x:|r:|mc:)[A-Za-z_][\w.-]*)(?=[\s/>])/gu, '<$1x:$2');
    zip.file(entryPath, prefixed);
  }
  const brokenZip = new JSZip();
  brokenZip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8"?><x:sst xmlns:x="${namespace}"/>`
  );
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || entry.name === 'xl/sharedStrings.xml') continue;
    brokenZip.file(entry.name, await entry.async('nodebuffer'), { date: entry.date });
  }
  const brokenBuffer = await brokenZip.generateAsync({ type: 'nodebuffer' });
  const originalHash = sha256(brokenBuffer);

  const normalizedWorkbook = await readConfiguredWorkbook(brokenBuffer, config);
  assert.equal(normalizedWorkbook.readerDiagnostics.mode, 'in_memory_prefixed_ooxml_repair');
  assert.equal(normalizedWorkbook.readerDiagnostics.originalBufferModified, false);
  assert.equal(sha256(brokenBuffer), originalHash);

  const result = runPipeline({
    workbook: normalizedWorkbook,
    source: { sha256: originalHash, bytes: brokenBuffer.length },
    config,
    generatedAt: new Date('2026-08-21T12:00:00.000Z')
  });
  assert.equal(result.contacts.length, 1);
  assert.equal(result.sheetStats['CRM Prospectos'].rowsIgnoredFormulaOnly, 1);

  validBuffer.fill(0);
  brokenBuffer.fill(0);
});

test('el fallback reconoce sólo el error exacto y rechaza referencias shared-string', async () => {
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const exactError = new Error(
    `Unexpected xml node in parseOpen: ${JSON.stringify({
      name: 'x:sst',
      attributes: { 'xmlns:x': namespace },
      isSelfClosing: true
    })}`
  );
  assert.equal(isEmptyPrefixedSharedStringsError(exactError), true);
  assert.equal(isEmptyPrefixedSharedStringsError(new Error('Unexpected XML')), false);

  const zip = new JSZip();
  zip.file('xl/sharedStrings.xml', `<x:sst xmlns:x="${namespace}"/>`);
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<x:worksheet xmlns:x="${namespace}"><x:sheetData><x:row><x:c t="s"><x:v>0</x:v></x:c></x:row></x:sheetData></x:worksheet>`
  );
  const unsafeBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(
    () => repairEmptyPrefixedSharedStringsInMemory(unsafeBuffer),
    /EMPTY_SHARED_STRINGS_HAS_CELL_REFERENCES/u
  );
  unsafeBuffer.fill(0);
});

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

test('la escritura exige que el responsable exista como administrador activo', async () => {
  let capturedQuery = null;
  const activeAdminClient = {
    async query(sql, parameters) {
      capturedQuery = { sql, parameters };
      return { rowCount: 1 };
    }
  };
  const uploaderId = '11111111-1111-4111-a111-111111111111';
  await assertUploaderIsActive(activeAdminClient, uploaderId);
  assert.match(capturedQuery.sql, /active\s*=\s*true/iu);
  assert.match(capturedQuery.sql, /role\s*=\s*'admin'/iu);
  assert.match(capturedQuery.sql, /deleted_at\s+IS\s+NULL/iu);
  assert.deepEqual(capturedQuery.parameters, [uploaderId]);

  await assert.rejects(
    () => assertUploaderIsActive({ query: async () => ({ rowCount: 0 }) }, uploaderId),
    /UPLOADER_NOT_ACTIVE/u
  );
});

test('normaliza sólo variantes acordadas de temporada y manda desconocidas a revisión', () => {
  for (const variant of ['LMP 2026-2027', 'LMP-2026-2027', 'LMP 26-27', 'lmp-2026-27']) {
    const normalized = normalizeSeasonCode(variant);
    assert.equal(normalized.code, 'LMP-2026-27');
    assert.equal(normalized.resolution, 'normalized');
  }
  assert.deepEqual(normalizeSeasonCode('LMP 2025'), {
    code: null,
    sourceValue: 'LMP 2025',
    resolution: 'requires_review',
    issueCode: 'UNKNOWN_SEASON_CODE',
    correctionCode: null
  });
  assert.equal(normalizeSeasonCode(null).issueCode, 'MISSING_SEASON_CODE');
});
