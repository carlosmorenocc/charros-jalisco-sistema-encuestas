import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)))

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

async function startBackend(dataDir) {
  const port = await availablePort()
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      CSV_DATA_DIR: dataDir,
      PUBLIC_FORMS_ENABLED: 'false',
      SUBSCRIBER_FORM_ENABLED: 'false',
      REWARDS_FORM_ENABLED: 'true',
      CSV_EXPORT_TOKEN: 'rewards-export-token',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      SUBMIT_RATE_LIMIT_PER_MIN: '1000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const baseUrl = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return { child, baseUrl }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  child.kill()
  throw new Error('Rewards backend did not become ready')
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))])
}

test('experiencias y recompensas valida, persiste y protege la exportación', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'charros-rewards-'))
  const backend = await startBackend(dataDir)
  t.after(async () => {
    await stopBackend(backend.child)
    await rm(dataDir, { recursive: true, force: true })
  })

  const invalid = await fetch(`${backend.baseUrl}/api/rewards-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ nombreCompleto: 'Ana', recomendacion: 'Más música', aceptaAvisoPrivacidad: false })
  })
  assert.equal(invalid.status, 400)

  const valid = await fetch(`${backend.baseUrl}/api/rewards-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      submissionId: 'reward-test-1',
      nombreCompleto: 'Ana López Pérez',
      recomendacion: 'Más actividades familiares antes del juego.',
      aceptaAvisoPrivacidad: true,
      aceptaComunicaciones: true
    })
  })
  assert.equal(valid.status, 201)

  const unauthorized = await fetch(`${backend.baseUrl}/api/rewards-submissions.csv`)
  assert.equal(unauthorized.status, 401)

  const authorized = await fetch(`${backend.baseUrl}/api/rewards-submissions.csv`, {
    headers: { Authorization: 'Bearer rewards-export-token' }
  })
  assert.equal(authorized.status, 200)
  const csv = await authorized.text()
  assert.match(csv, /nombreCompleto,recomendacion/)
  assert.match(csv, /ANA LÓPEZ PÉREZ/)
  assert.match(csv, /Más actividades familiares/)

  const stored = await readFile(path.join(dataDir, 'submissions_experiencias_recompensas.csv'), 'utf8')
  assert.equal(stored, csv)
})
