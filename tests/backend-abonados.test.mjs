import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const subscriberCsvFilename = 'submissions_abonados_lmp_2026_2027.csv'
const jerseyColumns = Array.from({ length: 25 }, (_, index) => `tallaJersey${index + 1}`)
const legacySubscriberColumns = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombre',
  'apellido',
  'email',
  'telefono',
  'tallaJersey',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
]

async function getAvailablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function startBackend(
  dataDir,
  {
    exportToken = 'test-export-token',
    abonadosExportToken = 'test-abonados-export-token',
    enabled = true
  } = {}
) {
  const port = await getAvailablePort()
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      CSV_DATA_DIR: dataDir,
      PUBLIC_FORMS_ENABLED: 'false',
      SUBSCRIBER_FORM_ENABLED: enabled ? 'true' : 'false',
      CSV_EXPORT_TOKEN: exportToken,
      ABONADOS_CSV_EXPORT_TOKEN: abonadosExportToken,
      ALLOWED_ORIGINS: 'http://localhost:5173',
      SUBMIT_RATE_LIMIT_PER_MIN: '1000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  const baseUrl = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 10000

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited before becoming ready.\n${output}`)
    }

    try {
      const response = await fetch(`${baseUrl}/healthz`)
      if (response.ok) return { child, baseUrl, getOutput: () => output }
    } catch {
      // The process may still be binding the port.
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  child.kill()
  throw new Error(`Backend did not become ready.\n${output}`)
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return

  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 3000))
  ])
}

async function postJson(baseUrl, pathname, body) {
  return fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173'
    },
    body: JSON.stringify(body)
  })
}

function subscriberBody(overrides = {}) {
  return {
    nombre: 'Ana',
    apellido: 'Charra',
    email: 'ana@example.com',
    telefono: '3312345678',
    cantidadAbonos: 1,
    tallasJersey: ['M'],
    aceptaAvisoPrivacidad: true,
    aceptaComunicaciones: false,
    ...overrides
  }
}

function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }

  values.push(current)
  return values
}

function parseCsv(content) {
  const [headerLine, ...rowLines] = content.trimEnd().split(/\r?\n/)
  const header = parseCsvLine(headerLine)
  const rows = rowLines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(header.map((column, index) => [column, values[index]]))
  })
  return { header, rows }
}

function csvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

test('backend de abonados persiste 1-25 tallas, deduplica y protege exportaciones', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'fantrack-abonados-'))
  let backend

  t.after(async () => {
    await stopBackend(backend?.child)
    await rm(dataDir, { recursive: true, force: true })
  })

  backend = await startBackend(dataDir)

  await t.test('rechaza tallas fuera del catálogo', async () => {
    const response = await postJson(
      backend.baseUrl,
      '/api/abonados-lmp-submit',
      subscriberBody({ tallasJersey: ['3XL'] })
    )

    assert.equal(response.status, 400)
    assert.deepEqual((await response.json()).invalid, ['tallasJersey'])
  })

  await t.test('valida cantidad de abonos, límites y correspondencia de tallas', async () => {
    for (const cantidadAbonos of [0, 26, 1.5, '2']) {
      const response = await postJson(
        backend.baseUrl,
        '/api/abonados-lmp-submit',
        subscriberBody({ cantidadAbonos })
      )
      assert.equal(response.status, 400, String(cantidadAbonos))
      assert.ok((await response.json()).invalid.includes('cantidadAbonos'))
    }

    const mismatch = await postJson(
      backend.baseUrl,
      '/api/abonados-lmp-submit',
      subscriberBody({ cantidadAbonos: 2, tallasJersey: ['M'] })
    )
    assert.equal(mismatch.status, 400)
    assert.deepEqual((await mismatch.json()).invalid, ['tallasJersey'])

    const tooManySizes = await postJson(
      backend.baseUrl,
      '/api/abonados-lmp-submit',
      subscriberBody({ cantidadAbonos: 25, tallasJersey: Array(26).fill('M') })
    )
    assert.equal(tooManySizes.status, 400)
    assert.deepEqual((await tooManySizes.json()).invalid, ['tallasJersey'])
  })

  await t.test('exige consentimiento booleano estricto', async () => {
    const response = await postJson(
      backend.baseUrl,
      '/api/abonados-lmp-submit',
      subscriberBody({ aceptaAvisoPrivacidad: 'true' })
    )

    assert.equal(response.status, 400)
    assert.ok((await response.json()).invalid.includes('aceptaAvisoPrivacidad'))
  })

  await t.test('confirma varias tallas con metadatos del servidor y CSV seguro', async () => {
    const response = await postJson(backend.baseUrl, '/api/abonados-lmp-submit', {
      submissionId: 'cliente-alterado',
      timestamp: '2000-01-01T00:00:00.000Z',
      campaignName: 'Campaña alterada',
      source: 'origen-alterado',
      nombre: '=HYPERLINK("https://evil.test")\nAna',
      apellido: 'Charra',
      email: ' Fan@Example.COM ',
      telefono: '+52 33 1234 5678',
      cantidadAbonos: 3,
      tallasJersey: ['m', ' xl ', '2xl'],
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: false
    })

    assert.equal(response.status, 201)
    const result = await response.json()
    assert.equal(result.ok, true)
    assert.equal(result.stored, true)
    assert.match(result.submissionId, /^[0-9a-f-]{36}$/)

    const csvPath = path.join(dataDir, subscriberCsvFilename)
    const csv = await readFile(csvPath, 'utf8')
    const { header, rows } = parseCsv(csv)
    assert.equal(rows.length, 1)
    assert.equal(header[8], 'cantidadAbonos')
    assert.deepEqual(header.slice(9, 34), jerseyColumns)
    assert.equal(rows[0].cantidadAbonos, '3')
    assert.deepEqual(
      [rows[0].tallaJersey1, rows[0].tallaJersey2, rows[0].tallaJersey3],
      ['M', 'XL', '2XL']
    )
    assert.ok(jerseyColumns.slice(3).every((column) => rows[0][column] === ''))
    assert.equal(rows[0].nombre, `'${'=HYPERLINK("https://evil.test") Ana'}`)
    assert.equal(rows[0].telefono, "'+52 33 1234 5678")
    assert.equal(rows[0].email, 'fan@example.com')
    assert.equal(rows[0].campaignName, 'Abonados LMP 2026-2027')
    assert.equal(rows[0].source, 'abonados-lmp-26-27')
    assert.equal(rows[0].privacyNoticeVersion, '2026-08-01')
    assert.doesNotMatch(csv, /cliente-alterado|Campaña alterada|origen-alterado|2000-01-01/)
  })

  await t.test('acepta temporalmente el payload legado sin inferir cuántos abonos tiene', async () => {
    const response = await postJson(backend.baseUrl, '/api/abonados-lmp-submit', {
      nombre: 'Luis',
      apellido: 'Charro',
      email: 'legacy@example.com',
      telefono: '3312345678',
      tallaJersey: 's',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: false
    })

    assert.equal(response.status, 201)
    const csv = await readFile(path.join(dataDir, subscriberCsvFilename), 'utf8')
    const { rows } = parseCsv(csv)
    assert.equal(rows.at(-1).cantidadAbonos, '')
    assert.equal(rows.at(-1).tallaJersey1, 'S')
    assert.ok(jerseyColumns.slice(1).every((column) => rows.at(-1)[column] === ''))
  })

  await t.test('acepta el límite superior de 25 abonos y 25 tallas', async () => {
    const response = await postJson(
      backend.baseUrl,
      '/api/abonados-lmp-submit',
      subscriberBody({
        email: 'veinticinco@example.com',
        cantidadAbonos: 25,
        tallasJersey: Array.from({ length: 25 }, (_, index) => index % 2 ? 'XL' : 'S')
      })
    )

    assert.equal(response.status, 201)
    const csv = await readFile(path.join(dataDir, subscriberCsvFilename), 'utf8')
    const { rows } = parseCsv(csv)
    assert.equal(rows.at(-1).cantidadAbonos, '25')
    assert.equal(rows.at(-1).tallaJersey1, 'S')
    assert.equal(rows.at(-1).tallaJersey25, 'S')
  })

  await t.test('rechaza el mismo correo normalizado', async () => {
    const response = await postJson(
      backend.baseUrl,
      '/api/abonados-lmp-submit',
      subscriberBody({ email: 'fan@example.com', tallasJersey: ['XL'] })
    )
    assert.equal(response.status, 409)
  })

  await t.test('separa los permisos de exportación general y de abonados', async () => {
    for (const pathname of [
      '/api/submissions.csv',
      '/api/leads-submissions.csv',
      '/api/abonados-lmp-submissions.csv'
    ]) {
      const response = await fetch(`${backend.baseUrl}${pathname}`)
      assert.equal(response.status, 401, pathname)
      assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
    }

    for (const pathname of ['/api/submissions.csv', '/api/leads-submissions.csv']) {
      const authorized = await fetch(`${backend.baseUrl}${pathname}`, {
        headers: { Authorization: 'Bearer test-export-token' }
      })
      assert.equal(authorized.status, 200, pathname)

      const subscriberTokenRejected = await fetch(`${backend.baseUrl}${pathname}`, {
        headers: { Authorization: 'Bearer test-abonados-export-token' }
      })
      assert.equal(subscriberTokenRejected.status, 401, pathname)
    }

    const generalTokenRejected = await fetch(
      `${backend.baseUrl}/api/abonados-lmp-submissions.csv`,
      { headers: { Authorization: 'Bearer test-export-token' } }
    )
    assert.equal(generalTokenRejected.status, 401)

    const authorized = await fetch(`${backend.baseUrl}/api/abonados-lmp-submissions.csv`, {
      headers: { Authorization: 'Bearer test-abonados-export-token' }
    })
    assert.equal(authorized.status, 200)
    assert.match(
      authorized.headers.get('content-disposition') || '',
      /submissions_abonados_lmp_2026_2027\.csv/
    )
    const exported = await authorized.text()
    assert.match(exported, /fan@example\.com/)
    assert.match(exported, /cantidadAbonos,tallaJersey1,tallaJersey2/)
  })

  await stopBackend(backend.child)
  backend = await startBackend(dataDir)

  await t.test('recarga la deduplicación desde el CSV al reiniciar', async () => {
    const response = await postJson(
      backend.baseUrl,
      '/api/abonados-lmp-submit',
      subscriberBody({ email: 'FAN@EXAMPLE.COM', tallasJersey: ['S'] })
    )
    assert.equal(response.status, 409)
  })

  await stopBackend(backend.child)
  backend = await startBackend(dataDir, {
    exportToken: 'test-export-token',
    abonadosExportToken: '',
    enabled: false
  })

  await t.test('mantiene captura apagada y cierra solo abonados si falta su token dedicado', async () => {
    const disabledSubmit = await postJson(backend.baseUrl, '/api/abonados-lmp-submit', {})
    assert.equal(disabledSubmit.status, 503)

    for (const pathname of ['/api/submissions.csv', '/api/leads-submissions.csv']) {
      const response = await fetch(`${backend.baseUrl}${pathname}`, {
        headers: { Authorization: 'Bearer test-export-token' }
      })
      assert.equal(response.status, 200, pathname)
    }

    const response = await fetch(`${backend.baseUrl}/api/abonados-lmp-submissions.csv`, {
      headers: { Authorization: 'Bearer test-export-token' }
    })
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
  })
})

test('migra de forma segura e idempotente el CSV legado de una talla', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'fantrack-abonados-migration-'))
  const csvPath = path.join(dataDir, subscriberCsvFilename)
  const legacyValues = [
    'legacy-id',
    '2026-07-31T18:00:00.000Z',
    'Abonados LMP 2026-2027',
    'abonados-lmp-26-27',
    'María',
    'Gómez',
    ' EXISTENTE@EXAMPLE.COM ',
    '+52 33 1111 2222',
    'XL',
    'true',
    'false',
    '2026-07-31',
    '2026-07-31T18:00:00.000Z'
  ]
  const legacyContent = `${legacySubscriberColumns.join(',')}\n${legacyValues.map(csvValue).join(',')}\n`
  let backend

  await writeFile(csvPath, legacyContent, 'utf8')

  t.after(async () => {
    await stopBackend(backend?.child)
    await rm(dataDir, { recursive: true, force: true })
  })

  backend = await startBackend(dataDir)

  const migratedContent = await readFile(csvPath, 'utf8')
  const migrated = parseCsv(migratedContent)
  assert.equal(migrated.rows.length, 1)
  assert.equal(migrated.rows[0].submissionId, 'legacy-id')
  assert.equal(migrated.rows[0].timestamp, '2026-07-31T18:00:00.000Z')
  assert.equal(migrated.rows[0].email, 'EXISTENTE@EXAMPLE.COM')
  assert.equal(migrated.rows[0].cantidadAbonos, '')
  assert.equal(migrated.rows[0].tallaJersey1, 'XL')
  assert.ok(jerseyColumns.slice(1).every((column) => migrated.rows[0][column] === ''))
  assert.equal(migrated.rows[0].aceptaAvisoPrivacidad, 'true')
  assert.equal(migrated.rows[0].aceptaComunicaciones, 'false')
  assert.equal(migrated.rows[0].privacyNoticeVersion, '2026-07-31')
  assert.equal(migrated.rows[0].consentTimestamp, '2026-07-31T18:00:00.000Z')

  const backupsAfterMigration = (await readdir(dataDir)).filter((filename) => (
    filename.startsWith('submissions_abonados_lmp_2026_2027_legacy_single_size_backup')
  ))
  assert.deepEqual(backupsAfterMigration, [
    'submissions_abonados_lmp_2026_2027_legacy_single_size_backup.csv'
  ])
  assert.equal(await readFile(path.join(dataDir, backupsAfterMigration[0]), 'utf8'), legacyContent)

  const duplicate = await postJson(
    backend.baseUrl,
    '/api/abonados-lmp-submit',
    subscriberBody({ email: 'existente@example.com' })
  )
  assert.equal(duplicate.status, 409)

  await stopBackend(backend.child)
  backend = await startBackend(dataDir)

  assert.equal(await readFile(csvPath, 'utf8'), migratedContent)
  const backupsAfterRestart = (await readdir(dataDir)).filter((filename) => (
    filename.startsWith('submissions_abonados_lmp_2026_2027_legacy_single_size_backup')
  ))
  assert.deepEqual(backupsAfterRestart, backupsAfterMigration)

  const duplicateAfterRestart = await postJson(
    backend.baseUrl,
    '/api/abonados-lmp-submit',
    subscriberBody({ email: ' EXISTENTE@EXAMPLE.COM ' })
  )
  assert.equal(duplicateAfterRestart.status, 409)
})

test('falla al iniciar y preserva un CSV de abonados con schema desconocido', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'fantrack-abonados-invalid-schema-'))
  const csvPath = path.join(dataDir, subscriberCsvFilename)
  const unknownContent = 'email,columnaDesconocida\n"persona@example.com","dato"\n'

  t.after(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  await writeFile(csvPath, unknownContent, 'utf8')

  await assert.rejects(
    startBackend(dataDir),
    /Unsupported subscriber CSV schema/
  )
  assert.equal(await readFile(csvPath, 'utf8'), unknownContent)

  const relatedFiles = (await readdir(dataDir)).filter((filename) => (
    filename.startsWith('submissions_abonados_lmp_2026_2027')
  ))
  assert.deepEqual(relatedFiles, [subscriberCsvFilename])
})
