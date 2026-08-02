import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)))

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

test('backend de abonados persiste, deduplica y protege las exportaciones', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'fantrack-abonados-'))
  let backend

  t.after(async () => {
    await stopBackend(backend?.child)
    await rm(dataDir, { recursive: true, force: true })
  })

  backend = await startBackend(dataDir)

  await t.test('rechaza talla fuera del catálogo', async () => {
    const response = await postJson(backend.baseUrl, '/api/abonados-lmp-submit', {
      nombre: 'Ana',
      apellido: 'Charra',
      email: 'ana@example.com',
      telefono: '3312345678',
      tallaJersey: '3XL',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: false
    })

    assert.equal(response.status, 400)
    assert.deepEqual((await response.json()).invalid, ['tallaJersey'])
  })

  await t.test('exige consentimiento booleano estricto', async () => {
    const response = await postJson(backend.baseUrl, '/api/abonados-lmp-submit', {
      nombre: 'Ana',
      apellido: 'Charra',
      email: 'ana@example.com',
      telefono: '3312345678',
      tallaJersey: 'M',
      aceptaAvisoPrivacidad: 'true',
      aceptaComunicaciones: false
    })

    assert.equal(response.status, 400)
    assert.ok((await response.json()).invalid.includes('aceptaAvisoPrivacidad'))
  })

  await t.test('confirma la escritura con metadatos del servidor y CSV seguro', async () => {
    const response = await postJson(backend.baseUrl, '/api/abonados-lmp-submit', {
      submissionId: 'cliente-alterado',
      timestamp: '2000-01-01T00:00:00.000Z',
      campaignName: 'Campaña alterada',
      source: 'origen-alterado',
      nombre: '=HYPERLINK("https://evil.test")\nAna',
      apellido: 'Charra',
      email: ' Fan@Example.COM ',
      telefono: '+52 33 1234 5678',
      tallaJersey: 'm',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: false
    })

    assert.equal(response.status, 201)
    const result = await response.json()
    assert.equal(result.ok, true)
    assert.equal(result.stored, true)
    assert.match(result.submissionId, /^[0-9a-f-]{36}$/)

    const csvPath = path.join(dataDir, 'submissions_abonados_lmp_2026_2027.csv')
    const csv = await readFile(csvPath, 'utf8')
    assert.equal(csv.trimEnd().split(/\r?\n/).length, 2)
    assert.match(csv, /"'=HYPERLINK\(""https:\/\/evil\.test""\) Ana"/)
    assert.match(csv, /"'\+52 33 1234 5678"/)
    assert.match(csv, /"fan@example\.com"/)
    assert.match(csv, /"Abonados LMP 2026-2027"/)
    assert.match(csv, /"abonados-lmp-26-27"/)
    assert.doesNotMatch(csv, /cliente-alterado|Campaña alterada|origen-alterado|2000-01-01/)
  })

  await t.test('rechaza el mismo correo normalizado', async () => {
    const response = await postJson(backend.baseUrl, '/api/abonados-lmp-submit', {
      nombre: 'Ana',
      apellido: 'Charra',
      email: 'fan@example.com',
      telefono: '3312345678',
      tallaJersey: 'XL',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: true
    })

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
    assert.match(authorized.headers.get('content-disposition') || '', /submissions_abonados_lmp_2026_2027\.csv/)
    assert.match(await authorized.text(), /fan@example\.com/)
  })

  await stopBackend(backend.child)
  backend = await startBackend(dataDir)

  await t.test('recarga la deduplicación desde el CSV al reiniciar', async () => {
    const response = await postJson(backend.baseUrl, '/api/abonados-lmp-submit', {
      nombre: 'Ana',
      apellido: 'Charra',
      email: 'FAN@EXAMPLE.COM',
      telefono: '3312345678',
      tallaJersey: 'S',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: false
    })

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
