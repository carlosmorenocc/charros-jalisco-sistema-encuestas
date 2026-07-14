import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { load as parseYaml } from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT || 3001)
const dataDir = process.env.CSV_DATA_DIR
  ? path.resolve(process.env.CSV_DATA_DIR)
  : path.join(__dirname, 'data')
const csvPath = path.join(dataDir, 'submissions.csv')
const leadsCsvPath = path.join(dataDir, 'submissions_leads.csv')
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
  'razonNoRenovo',
  'beneficioPreferido',
  'canalPromociones',
  'tipoInformacion',
  'comentario',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones'
]

const LEADS_CSV_COLUMNS = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombre',
  'apellido',
  'email',
  'telefono',
  'municipio',
  'frecuenciaVisita',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'aceptaRegistroDiario'
]

const REQUIRED_FIELDS = ['nombre', 'apellido', 'email']
const REQUIRED_LEAD_FIELDS = ['nombre', 'apellido', 'email', 'telefono', 'municipio', 'frecuenciaVisita']

const pendingRows = []
const recentSubmissionIds = new Map()
let flushTimer = null
let isFlushing = false

const leadPendingRows = []
let leadFlushTimer = null
let isLeadFlushing = false
const leadDailyEmailRegistry = new Map()

function loadOpenApiSpec() {
  if (!fs.existsSync(openApiPath)) return null
  try {
    const rawSpec = fs.readFileSync(openApiPath, 'utf8')
    const spec = parseYaml(rawSpec)
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

function ensureCsvFile(filePath, columns, legacyPrefix) {
  fs.mkdirSync(dataDir, { recursive: true })
  const expectedHeader = columns.join(',')

  if (fs.existsSync(filePath)) {
    const firstLine = fs.readFileSync(filePath, 'utf8').split(/\r?\n/, 1)[0]
    if (firstLine && firstLine !== expectedHeader) {
      const legacyPath = path.join(
        dataDir,
        `${legacyPrefix}_legacy_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
      )
      fs.renameSync(filePath, legacyPath)
      console.log(`CSV schema changed. Legacy file saved to: ${legacyPath}`)
    }
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${expectedHeader}\n`, 'utf8')
  }
}

function ensureDataFile() {
  ensureCsvFile(csvPath, CSV_COLUMNS, 'submissions')
}

function ensureLeadsDataFile() {
  ensureCsvFile(leadsCsvPath, LEADS_CSV_COLUMNS, 'submissions_leads')
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

function buildLeadsCsvRow(payload) {
  return LEADS_CSV_COLUMNS.map((column) => toCsvValue(payload[column])).join(',') + '\n'
}

function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values
}

function leadEmailDayKey(email, timestamp) {
  if (!email) return ''
  const safeDate = Number.isNaN(new Date(timestamp).getTime())
    ? new Date().toISOString().slice(0, 10)
    : new Date(timestamp).toISOString().slice(0, 10)
  return `${String(email).trim().toLowerCase()}|${safeDate}`
}

function loadLeadDailyEmailRegistry() {
  leadDailyEmailRegistry.clear()
  if (!fs.existsSync(leadsCsvPath)) return

  const content = fs.readFileSync(leadsCsvPath, 'utf8')
  const lines = content.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return

  const header = parseCsvLine(lines[0])
  const emailIdx = header.indexOf('email')
  const timestampIdx = header.indexOf('timestamp')
  if (emailIdx < 0 || timestampIdx < 0) return

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i])
    const email = values[emailIdx]
    const timestamp = values[timestampIdx]
    const key = leadEmailDayKey(email, timestamp)
    if (key) leadDailyEmailRegistry.set(key, true)
  }
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

function validateLeadPayload(payload) {
  const missing = REQUIRED_LEAD_FIELDS.filter((field) => !String(payload[field] || '').trim())
  if (!payload.aceptaAvisoPrivacidad) {
    missing.push('aceptaAvisoPrivacidad')
  }
  if (!payload.aceptaRegistroDiario) {
    missing.push('aceptaRegistroDiario')
  }

  return {
    valid: missing.length === 0,
    missing
  }
}

function normalizeLeadPayload(input) {
  const nowIso = new Date().toISOString()
  const raw = input && typeof input === 'object' ? input : {}
  const normalized = {
    ...Object.fromEntries(LEADS_CSV_COLUMNS.map((k) => [k, ''])),
    ...raw
  }

  if (!normalized.timestamp) normalized.timestamp = nowIso
  if (!normalized.submissionId) {
    normalized.submissionId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  return normalized
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

function enqueueLeadRow(row) {
  if (leadPendingRows.length >= maxQueueSize) return false
  leadPendingRows.push(row)
  scheduleLeadFlush()
  return true
}

function scheduleLeadFlush() {
  if (leadFlushTimer) return
  leadFlushTimer = setTimeout(() => {
    leadFlushTimer = null
    flushLeadQueue().catch((error) => {
      console.error('Leads CSV flush error', error)
    })
  }, flushIntervalMs)
}

async function flushLeadQueue() {
  if (isLeadFlushing || leadPendingRows.length === 0) return
  isLeadFlushing = true
  try {
    ensureLeadsDataFile()
    while (leadPendingRows.length > 0) {
      const batch = leadPendingRows.splice(0, maxBatchSize)
      await fs.promises.appendFile(leadsCsvPath, batch.join(''), 'utf8')
    }
  } finally {
    isLeadFlushing = false
    if (leadPendingRows.length > 0) scheduleLeadFlush()
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

app.post('/api/lead-submit', submitLimiter, (req, res) => {
  try {
    const payload = normalizeLeadPayload(req.body)
    const validation = validateLeadPayload(payload)

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

    const dailyKey = leadEmailDayKey(payload.email, payload.timestamp)
    if (dailyKey && leadDailyEmailRegistry.has(dailyKey)) {
      return res.status(409).json({
        ok: false,
        error: 'Daily email limit reached',
        detail: 'Este correo ya registró un lead hoy. Intenta de nuevo en el siguiente juego.'
      })
    }

    const enqueued = enqueueLeadRow(buildLeadsCsvRow(payload))
    if (!enqueued) {
      return res.status(503).json({ ok: false, error: 'Server busy, retry shortly' })
    }

    if (dailyKey) {
      leadDailyEmailRegistry.set(dailyKey, true)
    }

    return res.status(202).json({ ok: true, stored: true, queued: true })
  } catch (error) {
    console.error('Leads CSV persistence error', error)
    return res.status(500).json({ ok: false, error: 'Unable to persist lead submission' })
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
    res.status(500).json({ ok: false, error: 'Unable to read CSV', detail: error?.message || 'unknown error' })
  }
})

app.get('/api/leads-submissions.csv', async (_req, res) => {
  try {
    await flushLeadQueue()
    ensureLeadsDataFile()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="submissions_leads.csv"')
    fs.createReadStream(leadsCsvPath).pipe(res)
  } catch (error) {
    console.error('Leads CSV download error', error)
    res.status(500).json({ ok: false, error: 'Unable to read leads CSV', detail: error?.message || 'unknown error' })
  }
})

try {
  ensureDataFile()
  ensureLeadsDataFile()
  loadLeadDailyEmailRegistry()
} catch (error) {
  console.error('CSV init error', error)
}

process.on('SIGINT', async () => {
  try {
    await flushQueue()
    await flushLeadQueue()
  } finally {
    process.exit(0)
  }
})

process.on('SIGTERM', async () => {
  try {
    await flushQueue()
    await flushLeadQueue()
  } finally {
    process.exit(0)
  }
})

app.listen(port, () => {
  console.log(`Submission API listening on port ${port}`)
  console.log(`CSV storage path: ${csvPath}`)
})
