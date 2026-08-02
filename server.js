import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { randomUUID, timingSafeEqual } from 'node:crypto'
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
const subscriberCsvPath = path.join(dataDir, 'submissions_abonados_lmp_2026_2027.csv')
const openApiPath = path.join(__dirname, 'docs', 'openapi.yaml')
const flushIntervalMs = Number(process.env.CSV_FLUSH_INTERVAL_MS || 250)
const maxQueueSize = Number(process.env.CSV_MAX_QUEUE_SIZE || 10000)
const maxBatchSize = Number(process.env.CSV_MAX_BATCH_SIZE || 250)
const dedupeWindowMs = Number(process.env.CSV_DEDUPE_WINDOW_MS || 24 * 60 * 60 * 1000)
const submitRateLimit = Number(process.env.SUBMIT_RATE_LIMIT_PER_MIN || 180)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean)
const publicFormsEnabled = process.env.PUBLIC_FORMS_ENABLED === 'true'
const subscriberFormEnabled = process.env.SUBSCRIBER_FORM_ENABLED === 'true'
const csvExportToken = process.env.CSV_EXPORT_TOKEN || ''
const abonadosCsvExportToken = process.env.ABONADOS_CSV_EXPORT_TOKEN || ''

const SUBSCRIBER_CAMPAIGN_NAME = 'Abonados LMP 2026-2027'
const SUBSCRIBER_SOURCE = 'abonados-lmp-26-27'
const SUBSCRIBER_PRIVACY_NOTICE_VERSION = '2026-08-01'
const SUBSCRIBER_JERSEY_SIZES = new Set(['S', 'M', 'L', 'XL', '2XL'])
const SUBSCRIBER_MAX_SEASON_TICKETS = 25

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

const LEGACY_SUBSCRIBER_CSV_COLUMNS = [
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

const SUBSCRIBER_JERSEY_CSV_COLUMNS = Array.from(
  { length: SUBSCRIBER_MAX_SEASON_TICKETS },
  (_, index) => `tallaJersey${index + 1}`
)

const SUBSCRIBER_CSV_COLUMNS = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombre',
  'apellido',
  'email',
  'telefono',
  'cantidadAbonos',
  ...SUBSCRIBER_JERSEY_CSV_COLUMNS,
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
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

const subscriberEmailRegistry = new Set()
let subscriberWriteChain = Promise.resolve()

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

function ensureSubscriberDataFile() {
  fs.mkdirSync(dataDir, { recursive: true })
  const expectedHeader = SUBSCRIBER_CSV_COLUMNS.join(',')

  if (!fs.existsSync(subscriberCsvPath)) {
    fs.writeFileSync(subscriberCsvPath, `${expectedHeader}\n`, 'utf8')
    return
  }

  const legacyContent = fs.readFileSync(subscriberCsvPath, 'utf8')
  const firstLine = legacyContent.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, '')
  if (firstLine === expectedHeader) return

  const legacyHeader = LEGACY_SUBSCRIBER_CSV_COLUMNS.join(',')
  if (firstLine !== legacyHeader) {
    throw new Error(
      `Unsupported subscriber CSV schema at ${subscriberCsvPath}; existing data was preserved`
    )
  }

  const migratedContent = migrateLegacySubscriberCsv(legacyContent)
  const backupPath = ensureSubscriberMigrationBackup(legacyContent)
  const migrationPath = `${subscriberCsvPath}.migration.tmp`

  fs.writeFileSync(migrationPath, migratedContent, 'utf8')
  fs.renameSync(migrationPath, subscriberCsvPath)
  console.log(`Subscriber CSV migrated. Original file saved to: ${backupPath}`)
}

function ensureSubscriberMigrationBackup(legacyContent) {
  const backupBase = path.join(
    dataDir,
    'submissions_abonados_lmp_2026_2027_legacy_single_size_backup'
  )

  for (let suffix = 0; ; suffix += 1) {
    const backupPath = `${backupBase}${suffix === 0 ? '' : `_${suffix + 1}`}.csv`

    if (fs.existsSync(backupPath)) {
      if (fs.readFileSync(backupPath, 'utf8') === legacyContent) return backupPath
      continue
    }

    fs.copyFileSync(subscriberCsvPath, backupPath, fs.constants.COPYFILE_EXCL)
    return backupPath
  }
}

function migrateLegacySubscriberCsv(legacyContent) {
  const lines = legacyContent.split(/\r?\n/)
  const header = parseCsvLine(lines[0].replace(/^\uFEFF/, ''))
  const migratedRows = []

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue

    const values = parseCsvLine(line)
    if (values.length !== header.length) {
      throw new Error('Unable to safely migrate malformed subscriber CSV row')
    }

    const legacyRow = Object.fromEntries(header.map((column, index) => [column, values[index]]))
    const migratedRow = {
      ...legacyRow,
      // The legacy form never asked how many season tickets the person held.
      // Preserve that fact instead of inferring a value that was not collected.
      cantidadAbonos: '',
      tallaJersey1: legacyRow.tallaJersey
    }
    migratedRows.push(buildSubscriberCsvRow(migratedRow).trimEnd())
  }

  return `${SUBSCRIBER_CSV_COLUMNS.join(',')}\n${migratedRows.join('\n')}${migratedRows.length ? '\n' : ''}`
}

function sanitizeCsvText(value) {
  const normalized = String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()

  return /^\s*[=+\-@]/.test(normalized) ? `'${normalized}` : normalized
}

function toCsvValue(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) value = value.join(' | ')
  const text = sanitizeCsvText(value)
  return `"${text.replace(/"/g, '""')}"`
}

function buildCsvRow(payload) {
  return CSV_COLUMNS.map((column) => toCsvValue(payload[column])).join(',') + '\n'
}

function buildLeadsCsvRow(payload) {
  return LEADS_CSV_COLUMNS.map((column) => toCsvValue(payload[column])).join(',') + '\n'
}

function buildSubscriberCsvRow(payload) {
  return SUBSCRIBER_CSV_COLUMNS.map((column) => toCsvValue(payload[column])).join(',') + '\n'
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

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function loadSubscriberEmailRegistry() {
  subscriberEmailRegistry.clear()
  if (!fs.existsSync(subscriberCsvPath)) return

  const content = fs.readFileSync(subscriberCsvPath, 'utf8')
  const lines = content.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return

  const header = parseCsvLine(lines[0])
  const emailIdx = header.indexOf('email')
  if (emailIdx < 0) return

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i])
    const email = normalizeEmail(values[emailIdx])
    if (email) subscriberEmailRegistry.add(email)
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

function normalizeSubscriberPayload(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const timestamp = new Date().toISOString()
  const hasNewTicketFields = Object.hasOwn(raw, 'cantidadAbonos') || Object.hasOwn(raw, 'tallasJersey')
  const isLegacySingleSizePayload = !hasNewTicketFields && typeof raw.tallaJersey === 'string'
  const cantidadAbonos = isLegacySingleSizePayload ? '' : raw.cantidadAbonos
  const rawJerseySizes = isLegacySingleSizePayload ? [raw.tallaJersey] : raw.tallasJersey
  const tallasJersey = Array.isArray(rawJerseySizes)
    ? rawJerseySizes.map((size) => typeof size === 'string' ? size.trim().toUpperCase() : size)
    : rawJerseySizes

  return {
    submissionId: randomUUID(),
    timestamp,
    campaignName: SUBSCRIBER_CAMPAIGN_NAME,
    source: SUBSCRIBER_SOURCE,
    nombre: typeof raw.nombre === 'string' ? raw.nombre.trim() : '',
    apellido: typeof raw.apellido === 'string' ? raw.apellido.trim() : '',
    email: normalizeEmail(raw.email),
    telefono: typeof raw.telefono === 'string' ? raw.telefono.trim() : '',
    cantidadAbonos,
    tallasJersey,
    isLegacySingleSizePayload,
    ...Object.fromEntries(
      SUBSCRIBER_JERSEY_CSV_COLUMNS.map((column, index) => [
        column,
        Array.isArray(tallasJersey) ? tallasJersey[index] || '' : ''
      ])
    ),
    aceptaAvisoPrivacidad: raw.aceptaAvisoPrivacidad === true,
    aceptaComunicaciones: raw.aceptaComunicaciones === true,
    privacyNoticeVersion: SUBSCRIBER_PRIVACY_NOTICE_VERSION,
    consentTimestamp: timestamp,
    communicationsTypeValid:
      raw.aceptaComunicaciones === undefined || typeof raw.aceptaComunicaciones === 'boolean',
    privacyTypeValid: typeof raw.aceptaAvisoPrivacidad === 'boolean'
  }
}

function validateSubscriberPayload(payload) {
  const invalid = []
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const phoneDigits = payload.telefono.replace(/\D/g, '')

  if (payload.nombre.length < 2 || payload.nombre.length > 100) invalid.push('nombre')
  if (payload.apellido.length < 2 || payload.apellido.length > 100) invalid.push('apellido')
  if (payload.email.length > 254 || !emailPattern.test(payload.email)) invalid.push('email')
  if (payload.telefono.length > 32 || phoneDigits.length < 10 || phoneDigits.length > 15) {
    invalid.push('telefono')
  }
  const hasValidTicketCount = Number.isInteger(payload.cantidadAbonos)
    && payload.cantidadAbonos >= 1
    && payload.cantidadAbonos <= SUBSCRIBER_MAX_SEASON_TICKETS
  if (!payload.isLegacySingleSizePayload && !hasValidTicketCount) invalid.push('cantidadAbonos')

  const hasValidJerseySizes = Array.isArray(payload.tallasJersey)
    && payload.tallasJersey.every((size) => SUBSCRIBER_JERSEY_SIZES.has(size))
  const hasMatchingJerseySizeCount = payload.isLegacySingleSizePayload
    ? Array.isArray(payload.tallasJersey) && payload.tallasJersey.length === 1
    : hasValidTicketCount
      && Array.isArray(payload.tallasJersey)
      && payload.tallasJersey.length === payload.cantidadAbonos
  if (!hasValidJerseySizes || !hasMatchingJerseySizeCount) invalid.push('tallasJersey')
  if (!payload.privacyTypeValid || payload.aceptaAvisoPrivacidad !== true) {
    invalid.push('aceptaAvisoPrivacidad')
  }
  if (!payload.communicationsTypeValid) invalid.push('aceptaComunicaciones')

  return {
    valid: invalid.length === 0,
    invalid
  }
}

function appendSubscriberRow(row) {
  const writeOperation = subscriberWriteChain.then(async () => {
    ensureSubscriberDataFile()
    await fs.promises.appendFile(subscriberCsvPath, row, 'utf8')
  })

  subscriberWriteChain = writeOperation.catch(() => {})
  return writeOperation
}

async function flushSubscriberWrites() {
  await subscriberWriteChain
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

function requirePublicFormsEnabled(req, res, next) {
  if (publicFormsEnabled) return next()

  res.setHeader('Cache-Control', 'no-store')
  const isReadRequest = req.method === 'GET' || req.method === 'HEAD'
  return res.status(isReadRequest ? 404 : 503).json({
    ok: false,
    error: 'Public forms are temporarily disabled'
  })
}

function requireSubscriberFormEnabled(_req, res, next) {
  if (subscriberFormEnabled) return next()

  res.setHeader('Cache-Control', 'no-store')
  return res.status(503).json({
    ok: false,
    error: 'Subscriber form is temporarily disabled'
  })
}

function secureTokenEquals(received, expected) {
  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)
  if (receivedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(receivedBuffer, expectedBuffer)
}

function requireBearerExportToken(expectedToken) {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    if (!expectedToken) {
      return res.status(503).json({
        ok: false,
        error: 'CSV export is not configured'
      })
    }

    const authorization = req.get('authorization') || ''
    const bearerMatch = authorization.match(/^Bearer\s+([^\s]+)$/i)
    const receivedToken = bearerMatch?.[1] || ''

    if (!receivedToken || !secureTokenEquals(receivedToken, expectedToken)) {
      res.setHeader('WWW-Authenticate', 'Bearer')
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized CSV export'
      })
    }

    return next()
  }
}

const requireCsvExportToken = requireBearerExportToken(csvExportToken)
const requireAbonadosCsvExportToken = requireBearerExportToken(abonadosCsvExportToken)

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    status: 'ready',
    publicFormsEnabled,
    subscriberFormEnabled,
    queueSize: pendingRows.length
  })
})

app.get('/api/openapi.yaml', requirePublicFormsEnabled, (_req, res) => {
  if (!fs.existsSync(openApiPath)) {
    return res.status(404).json({ ok: false, error: 'OpenAPI file not found' })
  }
  res.type('application/yaml')
  return fs.createReadStream(openApiPath).pipe(res)
})

if (openApiSpec) {
  app.use(
    '/api/docs',
    requirePublicFormsEnabled,
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec)
  )
} else {
  app.get('/api/docs', requirePublicFormsEnabled, (_req, res) => {
    res.status(503).json({ ok: false, error: 'OpenAPI spec unavailable' })
  })
}

app.post('/api/submit', requirePublicFormsEnabled, submitLimiter, (req, res) => {
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

app.post('/api/lead-submit', requirePublicFormsEnabled, submitLimiter, (req, res) => {
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

app.post(
  '/api/abonados-lmp-submit',
  requireSubscriberFormEnabled,
  submitLimiter,
  async (req, res) => {
    const payload = normalizeSubscriberPayload(req.body)
    const validation = validateSubscriberPayload(payload)

    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid subscriber fields',
        invalid: validation.invalid
      })
    }

    const emailKey = payload.email
    if (subscriberEmailRegistry.has(emailKey)) {
      return res.status(409).json({
        ok: false,
        error: 'Subscriber email already registered'
      })
    }

    subscriberEmailRegistry.add(emailKey)

    try {
      await appendSubscriberRow(buildSubscriberCsvRow(payload))
      return res.status(201).json({
        ok: true,
        stored: true,
        submissionId: payload.submissionId
      })
    } catch (error) {
      subscriberEmailRegistry.delete(emailKey)
      console.error('Subscriber CSV persistence error', error)
      return res.status(500).json({
        ok: false,
        error: 'Unable to persist subscriber submission'
      })
    }
  }
)

app.get('/api/submissions.csv', requireCsvExportToken, async (_req, res) => {
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

app.get('/api/leads-submissions.csv', requireCsvExportToken, async (_req, res) => {
  try {
    await flushLeadQueue()
    ensureLeadsDataFile()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="submissions_leads.csv"')
    fs.createReadStream(leadsCsvPath).pipe(res)
  } catch (error) {
    console.error('Leads CSV download error', error)
    res.status(500).json({ ok: false, error: 'Unable to read leads CSV' })
  }
})

app.get('/api/abonados-lmp-submissions.csv', requireAbonadosCsvExportToken, async (_req, res) => {
  try {
    await flushSubscriberWrites()
    ensureSubscriberDataFile()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="submissions_abonados_lmp_2026_2027.csv"'
    )
    return fs.createReadStream(subscriberCsvPath).pipe(res)
  } catch (error) {
    console.error('Subscriber CSV download error', error)
    return res.status(500).json({
      ok: false,
      error: 'Unable to read subscriber CSV'
    })
  }
})

try {
  ensureDataFile()
  ensureLeadsDataFile()
  ensureSubscriberDataFile()
  loadLeadDailyEmailRegistry()
  loadSubscriberEmailRegistry()
} catch (error) {
  console.error('CSV init error', error)
  throw error
}

process.on('SIGINT', async () => {
  try {
    await flushQueue()
    await flushLeadQueue()
    await flushSubscriberWrites()
  } finally {
    process.exit(0)
  }
})

process.on('SIGTERM', async () => {
  try {
    await flushQueue()
    await flushLeadQueue()
    await flushSubscriberWrites()
  } finally {
    process.exit(0)
  }
})

app.listen(port, () => {
  console.log(`Submission API listening on port ${port}`)
  console.log(`CSV storage path: ${csvPath}`)
  console.log(`Subscriber CSV storage path: ${subscriberCsvPath}`)
})
