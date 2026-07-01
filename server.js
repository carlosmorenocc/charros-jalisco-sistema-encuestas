import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import yaml from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT || 3001)
const dataDir = process.env.CSV_DATA_DIR
  ? path.resolve(process.env.CSV_DATA_DIR)
  : path.join(__dirname, 'data')
const csvPath = path.join(dataDir, 'submissions.csv')
const openApiPath = path.join(__dirname, 'docs', 'openapi.yaml')
const flushIntervalMs = Number(process.env.CSV_FLUSH_INTERVAL_MS || 250)
const maxQueueSize = Number(process.env.CSV_MAX_QUEUE_SIZE || 10000)
const maxBatchSize = Number(process.env.CSV_MAX_BATCH_SIZE || 250)
const dedupeWindowMs = Number(process.env.CSV_DEDUPE_WINDOW_MS || 24 * 60 * 60 * 1000)
const submitRateLimit = Number(process.env.SUBMIT_RATE_LIMIT_PER_MIN || 180)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean)

const CSV_COLUMNS = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombre',
  'apellido',
  'email',
  'telefono',
  'myCashlessId',
  'rangoEdad',
  'sexo',
  'municipio',
  'relacionCharros',
  'antiguedad',
  'acompanantes',
  'motivacion',
  'calificacionExperiencia',
  'aspectosDisfrutados',
  'aspectosDisfrutadosOtro',
  'aspectosMejorar',
  'comentarioExperiencia',
  'facilidadMyCashless',
  'comentarioMyCashless',
  'consumoEstadio',
  'interesClubCharros',
  'razonAbonado',
  'razonNoRenovo',
  'barreraCompra',
  'beneficioPreferido',
  'probabilidadCompra',
  'canalPromociones',
  'tipoInformacion',
  'comentario',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones'
]

const REQUIRED_FIELDS = ['nombre', 'apellido', 'email', 'myCashlessId']

const pendingRows = []
const recentSubmissionIds = new Map()
let flushTimer = null
let isFlushing = false

function loadOpenApiSpec() {
  if (!fs.existsSync(openApiPath)) return null
  try {
    const rawSpec = fs.readFileSync(openApiPath, 'utf8')
    const spec = yaml.load(rawSpec)
    if (!spec || typeof spec !== 'object') return null

    const publicBaseUrl = process.env.PUBLIC_API_BASE_URL || ''
    if (publicBaseUrl) {
      spec.servers = [{ url: publicBaseUrl }]
    }

    return spec
  } catch (error) {
    console.error('OpenAPI load error', error)
    return null
  }
}

const openApiSpec = loadOpenApiSpec()

function ensureDataFile() {
  fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(csvPath)) {
    const header = CSV_COLUMNS.join(',') + '\n'
    fs.writeFileSync(csvPath, header, 'utf8')
  }
}

function toCsvValue(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) value = value.join(' | ')
  const text = String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function buildCsvRow(payload) {
  return CSV_COLUMNS.map((column) => toCsvValue(payload[column])).join(',') + '\n'
}

function cleanupOldSubmissionIds() {
  const now = Date.now()
  for (const [id, ts] of recentSubmissionIds.entries()) {
    if (now - ts > dedupeWindowMs) {
      recentSubmissionIds.delete(id)
    }
  }
}

function markAndCheckDuplicate(submissionId) {
  if (!submissionId) return false
  cleanupOldSubmissionIds()
  if (recentSubmissionIds.has(submissionId)) return true
  recentSubmissionIds.set(submissionId, Date.now())
  return false
}

function normalizePayload(input) {
  const nowIso = new Date().toISOString()
  const raw = input && typeof input === 'object' ? input : {}
  const normalized = {
    ...Object.fromEntries(CSV_COLUMNS.map((k) => [k, ''])),
    ...raw
  }

  if (!normalized.timestamp) normalized.timestamp = nowIso
  if (!normalized.submissionId) {
    normalized.submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  return normalized
}

function validatePayload(payload) {
  const missing = REQUIRED_FIELDS.filter((field) => !String(payload[field] || '').trim())
  return {
    valid: missing.length === 0,
    missing
  }
}

function enqueueRow(row) {
  if (pendingRows.length >= maxQueueSize) return false
  pendingRows.push(row)
  scheduleFlush()
  return true
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushQueue().catch((error) => {
      console.error('CSV flush error', error)
    })
  }, flushIntervalMs)
}

async function flushQueue() {
  if (isFlushing || pendingRows.length === 0) return
  isFlushing = true
  try {
    ensureDataFile()
    while (pendingRows.length > 0) {
      const batch = pendingRows.splice(0, maxBatchSize)
      await fs.promises.appendFile(csvPath, batch.join(''), 'utf8')
    }
  } finally {
    isFlushing = false
    if (pendingRows.length > 0) scheduleFlush()
  }
}

app.set('trust proxy', 1)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    return callback(new Error('CORS not allowed'))
  }
}))
app.use(express.json({ limit: '5mb' }))

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: submitRateLimit,
  standardHeaders: true,
  legacyHeaders: false
})

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, status: 'ready', queueSize: pendingRows.length })
})

app.get('/api/openapi.yaml', (_req, res) => {
  if (!fs.existsSync(openApiPath)) {
    return res.status(404).json({ ok: false, error: 'OpenAPI file not found' })
  }
  res.type('application/yaml')
  return fs.createReadStream(openApiPath).pipe(res)
})

if (openApiSpec) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec))
} else {
  app.get('/api/docs', (_req, res) => {
    res.status(503).json({ ok: false, error: 'OpenAPI spec unavailable' })
  })
}

app.post('/api/submit', submitLimiter, (req, res) => {
  try {
    const payload = normalizePayload(req.body)
    const validation = validatePayload(payload)

    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields',
        missing: validation.missing
      })
    }

    if (markAndCheckDuplicate(payload.submissionId)) {
      return res.status(200).json({ ok: true, stored: false, duplicate: true })
    }

    const enqueued = enqueueRow(buildCsvRow(payload))
    if (!enqueued) {
      return res.status(503).json({ ok: false, error: 'Server busy, retry shortly' })
    }

    res.status(202).json({ ok: true, stored: true, queued: true })
  } catch (error) {
    console.error('CSV persistence error', error)
    res.status(500).json({ ok: false, error: 'Unable to persist submission' })
  }
})

app.get('/api/submissions.csv', async (_req, res) => {
  try {
    await flushQueue()
    ensureDataFile()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.csv"')
    fs.createReadStream(csvPath).pipe(res)
  } catch (error) {
    console.error('CSV download error', error)
    res.status(500).json({ ok: false, error: 'Unable to read CSV' })
  }
})

process.on('SIGINT', async () => {
  try {
    await flushQueue()
  } finally {
    process.exit(0)
  }
})

process.on('SIGTERM', async () => {
  try {
    await flushQueue()
  } finally {
    process.exit(0)
  }
})

app.listen(port, () => {
  console.log(`Submission API listening on port ${port}`)
  console.log(`CSV storage path: ${csvPath}`)
})
