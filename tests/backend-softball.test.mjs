import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const softballCsvFilename = 'submissions_softbol_afiliados_2026.csv'
const rewardsCsvFilename = 'submissions_experiencias_recompensas.csv'
const eventId = 'softbol-club-charros-2026-11-08'
const softballColumns = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombreCompleto',
  'telefono',
  'eventoSeleccionado',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
]
const rewardsColumns = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombreCompleto',
  'eventosSeleccionados',
  'participaPapaSobreRuedas',
  'participaRomeoSantos',
  'recomendacion',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
]

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function startBackend(
  dataDir,
  {
    enabled = true,
    exportToken = 'softball-export-token',
    rateLimit = 1000
  } = {}
) {
  const port = await availablePort()
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      CSV_DATA_DIR: dataDir,
      PUBLIC_FORMS_ENABLED: 'false',
      SUBSCRIBER_FORM_ENABLED: 'false',
      REWARDS_FORM_ENABLED: 'false',
      SOFTBALL_FORM_ENABLED: enabled ? 'true' : 'false',
      CSV_EXPORT_TOKEN: exportToken,
      ABONADOS_CSV_EXPORT_TOKEN: 'abonados-export-token',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      SUBMIT_RATE_LIMIT_PER_MIN: String(rateLimit)
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
      throw new Error(`Softball backend exited before becoming ready.\n${output}`)
    }

    try {
      const response = await fetch(`${baseUrl}/healthz`)
      if (response.ok) return { child, baseUrl, getOutput: () => output }
    } catch {
      // The process may still be binding the port.
    }

    await new Promise((resolve) => setTimeout(resolve, 40))
  }

  child.kill()
  throw new Error(`Softball backend did not become ready.\n${output}`)
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
}

function softballBody(overrides = {}) {
  return {
    submissionId: 'softball-test-1',
    nombreCompleto: 'Ana L\u00f3pez P\u00e9rez',
    telefono: '+52 33 1234 5678',
    eventoSeleccionado: eventId,
    aceptaAvisoPrivacidad: true,
    aceptaComunicaciones: false,
    ...overrides
  }
}

async function postSoftball(baseUrl, body, origin = 'http://localhost:5173') {
  return fetch(`${baseUrl}/api/softball-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body)
  })
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

test('s\u00f3ftbol valida, deduplica por persona y persiste en un CSV independiente', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'charros-softball-'))
  const historicalRewardsRow = {
    submissionId: 'reward-historical-1',
    timestamp: '2026-10-20T00:00:00.000Z',
    campaignName: 'Club Charros \u00b7 Experiencias y Recompensas',
    source: 'club-charros-rewards',
    nombreCompleto: 'REGISTRO DE RECOMPENSAS',
    eventosSeleccionados: 'papa-sobre-ruedas-2026',
    participaPapaSobreRuedas: true,
    participaRomeoSantos: false,
    recomendacion: 'Conservar este registro',
    aceptaAvisoPrivacidad: true,
    aceptaComunicaciones: false,
    privacyNoticeVersion: '2026-10-20',
    consentTimestamp: '2026-10-20T00:00:00.000Z'
  }
  const rewardsContent = `${rewardsColumns.join(',')}\n${
    rewardsColumns.map((column) => csvValue(historicalRewardsRow[column])).join(',')
  }\n`
  await writeFile(path.join(dataDir, rewardsCsvFilename), rewardsContent, 'utf8')

  let backend = await startBackend(dataDir)
  t.after(async () => {
    await stopBackend(backend?.child)
    await rm(dataDir, { recursive: true, force: true })
  })

  await t.test('rechaza campos mal formados y metadatos de evento no autorizados', async () => {
    const invalidCases = [
      [softballBody({ submissionId: 'espacios no permitidos' }), 'submissionId'],
      [softballBody({ nombreCompleto: 'Ana' }), 'nombreCompleto'],
      [softballBody({ telefono: '33-1234-567' }), 'telefono'],
      [softballBody({ telefono: '331234567A' }), 'telefono'],
      [softballBody({ telefono: '0443312345678' }), 'telefono'],
      [softballBody({ telefono: '331234567890123' }), 'telefono'],
      [softballBody({ eventoSeleccionado: 'romeo-santos-live-mexico-2026' }), 'eventoSeleccionado'],
      [softballBody({ aceptaAvisoPrivacidad: 'true' }), 'aceptaAvisoPrivacidad'],
      [softballBody({ aceptaComunicaciones: 'false' }), 'aceptaComunicaciones']
    ]

    for (const [body, expectedInvalidField] of invalidCases) {
      const response = await postSoftball(backend.baseUrl, body)
      assert.equal(response.status, 400, expectedInvalidField)
      const result = await response.json()
      assert.ok(result.invalid.includes(expectedInvalidField), expectedInvalidField)
    }
  })

  await t.test('usa metadatos del servidor, may\u00fasculas y protecci\u00f3n de CSV', async () => {
    const response = await postSoftball(backend.baseUrl, {
      ...softballBody(),
      timestamp: '2000-01-01T00:00:00.000Z',
      campaignName: 'Campa\u00f1a alterada',
      source: 'origen-alterado',
      privacyNoticeVersion: 'alterada',
      consentTimestamp: '2000-01-01T00:00:00.000Z'
    })

    assert.equal(response.status, 201)
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.equal((await response.json()).submissionId, 'softball-test-1')

    const csv = await readFile(path.join(dataDir, softballCsvFilename), 'utf8')
    const { header, rows } = parseCsv(csv)
    assert.deepEqual(header, softballColumns)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].submissionId, 'softball-test-1')
    assert.equal(rows[0].campaignName, 'Club Charros \u00b7 Juego de s\u00f3ftbol para afiliados 2026')
    assert.equal(rows[0].source, 'softbol-afiliados-2026')
    assert.equal(rows[0].nombreCompleto, 'ANA L\u00d3PEZ P\u00c9REZ')
    assert.equal(rows[0].telefono, "'+52 33 1234 5678")
    assert.equal(rows[0].eventoSeleccionado, eventId)
    assert.equal(rows[0].aceptaAvisoPrivacidad, 'true')
    assert.equal(rows[0].aceptaComunicaciones, 'false')
    assert.equal(rows[0].privacyNoticeVersion, '2026-11-02')
    assert.equal(rows[0].consentTimestamp, rows[0].timestamp)
    assert.notEqual(rows[0].timestamp, '2000-01-01T00:00:00.000Z')
    assert.doesNotMatch(csv, /Campa\u00f1a alterada|origen-alterado|alterada/)
    assert.equal(await readFile(path.join(dataDir, rewardsCsvFilename), 'utf8'), rewardsContent)
  })

  await t.test('reintento idempotente no agrega otra fila', async () => {
    const response = await postSoftball(backend.baseUrl, softballBody({
      nombreCompleto: '  ana   l\u00f3pez p\u00e9rez ',
      telefono: '3312345678'
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      ok: true,
      stored: false,
      duplicate: true,
      submissionId: 'softball-test-1'
    })

    const { rows } = parseCsv(await readFile(path.join(dataDir, softballCsvFilename), 'utf8'))
    assert.equal(rows.length, 1)

    const changedConsent = await postSoftball(backend.baseUrl, softballBody({
      aceptaComunicaciones: true
    }))
    assert.equal(changedConsent.status, 409)
    assert.equal((await changedConsent.json()).error, 'Softball submission ID already used')

    const afterConflict = parseCsv(await readFile(path.join(dataDir, softballCsvFilename), 'utf8'))
    assert.equal(afterConflict.rows.length, 1)
    assert.equal(afterConflict.rows[0].aceptaComunicaciones, 'false')
  })

  await t.test('normaliza prefijos telefónicos mexicanos al deduplicar', async () => {
    const accepted = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-phone-prefix',
      nombreCompleto: 'Prefijo Mexicano Prueba',
      telefono: '0052 33 4444 5555'
    }))
    assert.equal(accepted.status, 201)

    const duplicate = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-phone-prefix-duplicate',
      nombreCompleto: 'PREFIJO MEXICANO PRUEBA',
      telefono: '5213344445555'
    }))
    assert.equal(duplicate.status, 409)
    assert.equal((await duplicate.json()).error, 'Softball participant already registered')
  })

  await t.test('rechaza la misma persona normalizada pero permite otro nombre con el mismo tel\u00e9fono', async () => {
    const duplicatePerson = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-test-2',
      nombreCompleto: 'ANA LOPEZ PEREZ',
      telefono: '33 1234 5678'
    }))
    assert.equal(duplicatePerson.status, 409)
    const duplicateResult = await duplicatePerson.json()
    assert.equal(duplicateResult.error, 'Softball participant already registered')
    assert.match(duplicateResult.detail, /ya tiene un registro/i)

    const anotherPerson = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-test-3',
      nombreCompleto: 'Beatriz L\u00f3pez P\u00e9rez',
      telefono: '3312345678'
    }))
    assert.equal(anotherPerson.status, 201)

    const reusedSubmissionId = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-test-3',
      nombreCompleto: 'Carlos Charro Nuevo',
      telefono: '3311112222'
    }))
    assert.equal(reusedSubmissionId.status, 409)
    assert.equal((await reusedSubmissionId.json()).error, 'Softball submission ID already used')
  })

  await t.test('serializa registros simult\u00e1neos de la misma persona', async () => {
    const responses = await Promise.all([
      postSoftball(backend.baseUrl, softballBody({
        submissionId: 'softball-concurrent-1',
        nombreCompleto: 'Concurrencia Charra Uno',
        telefono: '3333334444'
      })),
      postSoftball(backend.baseUrl, softballBody({
        submissionId: 'softball-concurrent-2',
        nombreCompleto: 'Concurrencia Charra Uno',
        telefono: '+52 33 3333 4444'
      }))
    ])
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409])
  })

  await t.test('exporta solo s\u00f3ftbol con CSV_EXPORT_TOKEN', async () => {
    const unauthorized = await fetch(`${backend.baseUrl}/api/softball-submissions.csv`)
    assert.equal(unauthorized.status, 401)
    assert.equal(unauthorized.headers.get('cache-control'), 'private, no-store, max-age=0')

    const wrongToken = await fetch(`${backend.baseUrl}/api/softball-submissions.csv`, {
      headers: { Authorization: 'Bearer abonados-export-token' }
    })
    assert.equal(wrongToken.status, 401)

    const authorized = await fetch(`${backend.baseUrl}/api/softball-submissions.csv`, {
      headers: { Authorization: 'Bearer softball-export-token' }
    })
    assert.equal(authorized.status, 200)
    assert.match(
      authorized.headers.get('content-disposition') || '',
      /submissions_softbol_afiliados_2026\.csv/
    )
    const exported = await authorized.text()
    assert.equal(exported, await readFile(path.join(dataDir, softballCsvFilename), 'utf8'))
    assert.doesNotMatch(exported, /REGISTRO DE RECOMPENSAS|papa-sobre-ruedas|romeo-santos/)
  })

  await stopBackend(backend.child)
  backend = await startBackend(dataDir)

  await t.test('reconstruye deduplicaci\u00f3n e idempotencia despu\u00e9s de reiniciar', async () => {
    const duplicatePerson = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-after-restart',
      nombreCompleto: 'Ana Lopez Perez',
      telefono: '3312345678'
    }))
    assert.equal(duplicatePerson.status, 409)

    const idempotentRetry = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-test-1',
      nombreCompleto: 'ANA LOPEZ PEREZ',
      telefono: '3312345678'
    }))
    assert.equal(idempotentRetry.status, 200)
    assert.equal((await idempotentRetry.json()).duplicate, true)

    const changedConsent = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-test-1',
      nombreCompleto: 'ANA LOPEZ PEREZ',
      telefono: '3312345678',
      aceptaComunicaciones: true
    }))
    assert.equal(changedConsent.status, 409)
  })

  await stopBackend(backend.child)
  backend = await startBackend(dataDir, { enabled: false })

  await t.test('el flag apaga la captura sin bloquear la exportaci\u00f3n hist\u00f3rica', async () => {
    const health = await (await fetch(`${backend.baseUrl}/healthz`)).json()
    assert.equal(health.softballFormEnabled, false)

    const disabled = await postSoftball(backend.baseUrl, softballBody({
      submissionId: 'softball-disabled'
    }))
    assert.equal(disabled.status, 503)
    assert.equal(disabled.headers.get('cache-control'), 'no-store')

    const exported = await fetch(`${backend.baseUrl}/api/softball-submissions.csv`, {
      headers: { Authorization: 'Bearer softball-export-token' }
    })
    assert.equal(exported.status, 200)
    assert.match(await exported.text(), /softball-test-1/)
  })
})

test('el endpoint de s\u00f3ftbol conserva el rate limit compartido', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'charros-softball-rate-limit-'))
  const backend = await startBackend(dataDir, { rateLimit: 1 })
  t.after(async () => {
    await stopBackend(backend.child)
    await rm(dataDir, { recursive: true, force: true })
  })

  const first = await postSoftball(backend.baseUrl, softballBody({ submissionId: 'rate-limit-1' }))
  assert.equal(first.status, 201)
  const second = await postSoftball(backend.baseUrl, softballBody({
    submissionId: 'rate-limit-2',
    nombreCompleto: 'Otra Persona Charra',
    telefono: '3399998888'
  }))
  assert.equal(second.status, 429)
})

test('un esquema desconocido de s\u00f3ftbol impide iniciar sin sobrescribir datos', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'charros-softball-invalid-schema-'))
  const csvPath = path.join(dataDir, softballCsvFilename)
  const unknownContent = 'submissionId,columnaDesconocida\n"registro-1","dato"\n'
  await writeFile(csvPath, unknownContent, 'utf8')

  t.after(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  await assert.rejects(
    startBackend(dataDir),
    /Unsupported softball CSV schema/
  )
  assert.equal(await readFile(csvPath, 'utf8'), unknownContent)
})
