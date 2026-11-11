import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const arjonaFilename = 'submissions_ricardo_arjona_2026.csv'
const arjonaEventId = 'ricardo-arjona-pase-doble-2026-11-16'
const columns = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombreCompleto',
  'eventoSeleccionado',
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
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  return port
}

async function startBackend(dataDir, {
  enabled = true,
  deadline = '2099-11-13T15:00:00.000Z'
} = {}) {
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
      SOFTBALL_FORM_ENABLED: 'false',
      ARJONA_FORM_ENABLED: enabled ? 'true' : 'false',
      ARJONA_REGISTRATION_DEADLINE: deadline,
      CSV_EXPORT_TOKEN: 'arjona-export-token',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      SUBMIT_RATE_LIMIT_PER_MIN: '1000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const output = []
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  const baseUrl = `http://127.0.0.1:${port}`
  const readyBy = Date.now() + 10000
  while (Date.now() < readyBy) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited early (${child.exitCode}): ${output.join('')}`)
    }
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return { child, baseUrl, output }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  child.kill()
  throw new Error(`Ricardo Arjona backend did not become ready: ${output.join('')}`)
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
}

function validPayload(overrides = {}) {
  return {
    submissionId: 'arjona-test-1',
    nombreCompleto: 'Ana López Pérez',
    eventoSeleccionado: arjonaEventId,
    recomendacion: 'Más experiencias musicales para los abonados.',
    aceptaAvisoPrivacidad: true,
    aceptaComunicaciones: false,
    ...overrides
  }
}

async function submit(baseUrl, payload) {
  return fetch(`${baseUrl}/api/ricardo-arjona-submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173'
    },
    body: JSON.stringify(payload)
  })
}

test('Ricardo Arjona valida, persiste en su propia base y protege su exportación', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'charros-arjona-'))
  const backend = await startBackend(dataDir)
  t.after(async () => {
    await stopBackend(backend.child)
    await rm(dataDir, { recursive: true, force: true })
  })

  const health = await (await fetch(`${backend.baseUrl}/healthz`)).json()
  assert.equal(health.arjonaFormEnabled, true)
  assert.equal(health.arjonaRegistrationOpen, true)
  assert.equal(health.arjonaRegistrationDeadline, '2099-11-13T15:00:00.000Z')

  const invalid = await submit(backend.baseUrl, validPayload({
    eventoSeleccionado: 'romeo-santos-live-mexico-2026',
    recomendacion: 'No'
  }))
  assert.equal(invalid.status, 400)
  assert.deepEqual((await invalid.json()).invalid.sort(), [
    'eventoSeleccionado',
    'recomendacion'
  ])

  const created = await submit(backend.baseUrl, validPayload())
  assert.equal(created.status, 201)
  assert.deepEqual(await created.json(), {
    ok: true,
    stored: true,
    submissionId: 'arjona-test-1'
  })

  const duplicate = await submit(backend.baseUrl, validPayload())
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).duplicate, true)

  const conflict = await submit(backend.baseUrl, validPayload({
    nombreCompleto: 'OTRA PERSONA CON EL MISMO ID'
  }))
  assert.equal(conflict.status, 409)
  assert.deepEqual(await conflict.json(), {
    ok: false,
    stored: false,
    conflict: true,
    error: 'submissionId already belongs to a different Ricardo Arjona registration',
    submissionId: 'arjona-test-1'
  })

  const unauthorized = await fetch(`${backend.baseUrl}/api/ricardo-arjona-submissions.csv`)
  assert.equal(unauthorized.status, 401)
  assert.match(unauthorized.headers.get('cache-control') || '', /no-store/)

  const authorized = await fetch(`${backend.baseUrl}/api/ricardo-arjona-submissions.csv`, {
    headers: { Authorization: 'Bearer arjona-export-token' }
  })
  assert.equal(authorized.status, 200)
  assert.match(
    authorized.headers.get('content-disposition') || '',
    /submissions_ricardo_arjona_2026\.csv/
  )
  const csv = await authorized.text()
  const rows = csv.trim().split(/\r?\n/)
  assert.equal(rows.length, 2)
  assert.equal(rows[0], columns.join(','))
  assert.match(csv, /ANA LÓPEZ PÉREZ/)
  assert.match(csv, /ricardo-arjona-pase-doble-2026-11-16/)
  assert.match(csv, /Club Charros · Pase doble Ricardo Arjona 2026/)
  assert.match(csv, /ricardo-arjona-2026/)
  assert.match(csv, /2026-11-11/)

  const storedArjona = await readFile(path.join(dataDir, arjonaFilename), 'utf8')
  const storedHistorical = await readFile(
    path.join(dataDir, 'submissions_experiencias_recompensas.csv'),
    'utf8'
  )
  const storedSoftball = await readFile(
    path.join(dataDir, 'submissions_softbol_afiliados_2026.csv'),
    'utf8'
  )
  assert.equal(storedArjona, csv)
  assert.doesNotMatch(storedHistorical, /ANA LÓPEZ PÉREZ|ricardo-arjona/i)
  assert.doesNotMatch(storedSoftball, /ANA LÓPEZ PÉREZ|ricardo-arjona/i)
})

test('Ricardo Arjona respeta interruptor y cierre autoritativo del backend', async (t) => {
  const disabledDir = await mkdtemp(path.join(os.tmpdir(), 'charros-arjona-disabled-'))
  const closedDir = await mkdtemp(path.join(os.tmpdir(), 'charros-arjona-closed-'))
  const disabled = await startBackend(disabledDir, { enabled: false })
  const closed = await startBackend(closedDir, {
    enabled: true,
    deadline: '2000-11-13T15:00:00.000Z'
  })
  t.after(async () => {
    await Promise.all([stopBackend(disabled.child), stopBackend(closed.child)])
    await Promise.all([
      rm(disabledDir, { recursive: true, force: true }),
      rm(closedDir, { recursive: true, force: true })
    ])
  })

  const disabledResponse = await submit(disabled.baseUrl, validPayload())
  assert.equal(disabledResponse.status, 503)
  assert.match(disabledResponse.headers.get('cache-control') || '', /no-store/)

  const closedResponse = await submit(closed.baseUrl, validPayload())
  assert.equal(closedResponse.status, 410)
  assert.match(closedResponse.headers.get('cache-control') || '', /no-store/)
  assert.equal((await closedResponse.json()).deadline, '2000-11-13T15:00:00.000Z')

  const disabledCsv = await readFile(path.join(disabledDir, arjonaFilename), 'utf8')
  const closedCsv = await readFile(path.join(closedDir, arjonaFilename), 'utf8')
  assert.equal(disabledCsv.trim(), columns.join(','))
  assert.equal(closedCsv.trim(), columns.join(','))
})

test('Ricardo Arjona serializa registros concurrentes sin perder filas', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'charros-arjona-concurrent-'))
  const backend = await startBackend(dataDir)
  t.after(async () => {
    await stopBackend(backend.child)
    await rm(dataDir, { recursive: true, force: true })
  })

  const responses = await Promise.all(Array.from({ length: 30 }, (_, index) => submit(
    backend.baseUrl,
    validPayload({
      submissionId: `arjona-concurrent-${index + 1}`,
      nombreCompleto: `PARTICIPANTE PRUEBA ${index + 1}`
    })
  )))
  assert.deepEqual(new Set(responses.map((response) => response.status)), new Set([201]))

  const exported = await fetch(`${backend.baseUrl}/api/ricardo-arjona-submissions.csv`, {
    headers: { Authorization: 'Bearer arjona-export-token' }
  })
  assert.equal(exported.status, 200)
  const lines = (await exported.text()).trim().split(/\r?\n/)
  assert.equal(lines.length, 31)
  for (let index = 1; index <= 30; index += 1) {
    assert.ok(lines.some((line) => line.includes(`arjona-concurrent-${index}`)))
  }
})

test('un esquema desconocido de Ricardo Arjona impide iniciar sin ocultar datos', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'charros-arjona-invalid-schema-'))
  const csvPath = path.join(dataDir, arjonaFilename)
  const unknownContent = 'submissionId,columnaDesconocida\n"registro-1","dato"\n'
  await writeFile(csvPath, unknownContent, 'utf8')

  t.after(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  await assert.rejects(
    startBackend(dataDir),
    /Unsupported Ricardo Arjona CSV schema/
  )
  assert.equal(await readFile(csvPath, 'utf8'), unknownContent)
})
