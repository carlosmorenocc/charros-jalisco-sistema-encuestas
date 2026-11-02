import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
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
const rewardsCsvPath = path.join(dataDir, 'submissions_experiencias_recompensas.csv')
const softballCsvPath = path.join(dataDir, 'submissions_softbol_afiliados_2026.csv')
const openApiPath = path.join(__dirname, 'docs', 'openapi.yaml')
const flushIntervalMs = Number(process.env.CSV_FLUSH_INTERVAL_MS || 250)
const maxQueueSize = Number(process.env.CSV_MAX_QUEUE_SIZE || 10000)
const maxBatchSize = Number(process.env.CSV_MAX_BATCH_SIZE || 250)
const dedupeWindowMs = Number(process.env.CSV_DEDUPE_WINDOW_MS || 24 * 60 * 60 * 1000)
const submitRateLimit = Number(process.env.SUBMIT_RATE_LIMIT_PER_MIN || 180)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean)
const publicFormsEnabled = process.env.PUBLIC_FORMS_ENABLED === 'true'
const subscriberFormEnabled = process.env.SUBSCRIBER_FORM_ENABLED === 'true'
const rewardsFormEnabled = process.env.REWARDS_FORM_ENABLED === 'true'
const softballFormEnabled = process.env.SOFTBALL_FORM_ENABLED === 'true'
const softballRegistrationDeadline = process.env.SOFTBALL_REGISTRATION_DEADLINE
  || '2026-11-04T06:00:00.000Z'
const softballRegistrationDeadlineMs = Date.parse(softballRegistrationDeadline)
if (Number.isNaN(softballRegistrationDeadlineMs)) {
  throw new Error('SOFTBALL_REGISTRATION_DEADLINE must be a valid ISO-8601 timestamp')
}
const csvExportToken = process.env.CSV_EXPORT_TOKEN || ''
const abonadosCsvExportToken = process.env.ABONADOS_CSV_EXPORT_TOKEN || ''

const SUBSCRIBER_CAMPAIGN_NAME = 'Abonados LMP 2026-2027'
const SUBSCRIBER_SOURCE = 'abonados-lmp-26-27'
const SUBSCRIBER_PRIVACY_NOTICE_VERSION = '2026-09-07'
const SUBSCRIBER_JERSEY_SIZES = new Set(['S', 'M', 'L', 'XL', '2XL'])
const SUBSCRIBER_ZONES = new Set(['VIP', 'PREFERENTE', 'GENERAL'])
const SUBSCRIBER_DELIVERY_PREFERENCES = new Set(['APP_BOLETOMOVIL', 'PDF'])
const SUBSCRIBER_MAX_SEASON_TICKETS = 20
// Preserve the deployed 25-column CSV schema so historical records remain readable.
const SUBSCRIBER_JERSEY_CSV_CAPACITY = 25

const SOFTBALL_CAMPAIGN_NAME = 'Club Charros \u00b7 Juego de s\u00f3ftbol para afiliados 2026'
const SOFTBALL_SOURCE = 'softbol-afiliados-2026'
const SOFTBALL_EVENT_ID = 'softbol-club-charros-2026-11-08'
const SOFTBALL_PRIVACY_NOTICE_VERSION = '2026-11-02'
const SOFTBALL_MAX_SEASON_TICKETS = 20
const SOFTBALL_REGISTRATION_MODES = new Set([
  'INDIVIDUAL_HISTORICO',
  'INDIVIDUAL_COMPATIBILIDAD',
  'MULTIPARTICIPANTE'
])

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

const LEGACY_REWARDS_CSV_COLUMNS = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombreCompleto',
  'recomendacion',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
]

const REWARDS_CSV_COLUMNS = [
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

const REWARD_EVENT_IDS = new Set([
  'papa-sobre-ruedas-2026',
  'romeo-santos-live-mexico-2026'
])

const LEGACY_SOFTBALL_CSV_COLUMNS = [
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

const PREVIOUS_SOFTBALL_CSV_COLUMNS = [
  'submissionId',
  'timestamp',
  'campaignName',
  'source',
  'nombreCompleto',
  'telefono',
  'cantidadAbonos',
  'eventoSeleccionado',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
]

const SOFTBALL_CSV_COLUMNS = [
  'submissionId',
  'folioRegistro',
  'participanteId',
  'modalidadRegistro',
  'timestamp',
  'campaignName',
  'source',
  'nombreCompleto',
  'telefono',
  'cantidadAbonos',
  'eventoSeleccionado',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones',
  'privacyNoticeVersion',
  'consentTimestamp'
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
  { length: SUBSCRIBER_JERSEY_CSV_CAPACITY },
  (_, index) => `tallaJersey${index + 1}`
)

const PREVIOUS_SUBSCRIBER_CSV_COLUMNS = [
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

const SUBSCRIBER_ZONE_CSV_COLUMNS = Array.from(
  { length: SUBSCRIBER_JERSEY_CSV_CAPACITY },
  (_, index) => `zonaAbono${index + 1}`
)
const SUBSCRIBER_PERSONALIZATION_TEXT_CSV_COLUMNS = Array.from(
  { length: SUBSCRIBER_JERSEY_CSV_CAPACITY },
  (_, index) => `personalizacionTexto${index + 1}`
)
const SUBSCRIBER_PERSONALIZATION_NUMBER_CSV_COLUMNS = Array.from(
  { length: SUBSCRIBER_JERSEY_CSV_CAPACITY },
  (_, index) => `personalizacionNumero${index + 1}`
)

const SUBSCRIBER_CSV_COLUMNS = [
  'submissionId', 'timestamp', 'campaignName', 'source', 'nombre', 'apellido', 'email', 'telefono', 'cantidadAbonos',
  ...SUBSCRIBER_ZONE_CSV_COLUMNS,
  ...SUBSCRIBER_JERSEY_CSV_COLUMNS,
  ...SUBSCRIBER_PERSONALIZATION_TEXT_CSV_COLUMNS,
  ...SUBSCRIBER_PERSONALIZATION_NUMBER_CSV_COLUMNS,
  'boletoMovilLigado', 'boletoMovilId', 'preferenciaEntrega',
  'aceptaAvisoPrivacidad', 'aceptaComunicaciones', 'privacyNoticeVersion', 'consentTimestamp'
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
let rewardsWriteChain = Promise.resolve()
const softballSubmissionRegistry = new Map()
const softballParticipantRegistry = new Set()
let softballWriteChain = Promise.resolve()
let softballNextRegistrationNumber = 1
const softballTransactionPath = `${softballCsvPath}.transaction.json`

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

  const supportedHeaders = new Set([
    LEGACY_SUBSCRIBER_CSV_COLUMNS.join(','),
    PREVIOUS_SUBSCRIBER_CSV_COLUMNS.join(',')
  ])
  if (!supportedHeaders.has(firstLine)) {
    throw new Error(
      `Unsupported subscriber CSV schema at ${subscriberCsvPath}; existing data was preserved`
    )
  }

  const migratedContent = migrateSubscriberCsv(legacyContent)
  const backupPath = ensureSubscriberMigrationBackup(legacyContent)
  const migrationPath = `${subscriberCsvPath}.migration.tmp`

  fs.writeFileSync(migrationPath, migratedContent, 'utf8')
  fs.renameSync(migrationPath, subscriberCsvPath)
  console.log(`Subscriber CSV migrated. Original file saved to: ${backupPath}`)
}

function ensureRewardsDataFile() {
  fs.mkdirSync(dataDir, { recursive: true })
  const expectedHeader = REWARDS_CSV_COLUMNS.join(',')
  if (!fs.existsSync(rewardsCsvPath)) {
    fs.writeFileSync(rewardsCsvPath, `${expectedHeader}\n`, 'utf8')
    return
  }

  const legacyContent = fs.readFileSync(rewardsCsvPath, 'utf8')
  const firstLine = legacyContent.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, '')
  if (firstLine === expectedHeader) return
  if (firstLine !== LEGACY_REWARDS_CSV_COLUMNS.join(',')) {
    throw new Error(`Unsupported rewards CSV schema at ${rewardsCsvPath}; existing data was preserved`)
  }

  const migratedContent = migrateLegacyRewardsCsv(legacyContent)
  const backupPath = ensureRewardsMigrationBackup(legacyContent)
  const migrationPath = `${rewardsCsvPath}.migration.tmp`
  fs.writeFileSync(migrationPath, migratedContent, 'utf8')
  fs.renameSync(migrationPath, rewardsCsvPath)
  console.log(`Rewards CSV migrated. Original file saved to: ${backupPath}`)
}

function ensureSoftballDataFile() {
  fs.mkdirSync(dataDir, { recursive: true })
  const expectedHeader = SOFTBALL_CSV_COLUMNS.join(',')

  if (!fs.existsSync(softballCsvPath)) {
    fs.writeFileSync(softballCsvPath, `${expectedHeader}\n`, 'utf8')
    return
  }

  const legacyContent = fs.readFileSync(softballCsvPath, 'utf8')
  const firstLine = legacyContent.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, '')
  if (firstLine === expectedHeader) return

  const supportedPreviousHeaders = new Set([
    LEGACY_SOFTBALL_CSV_COLUMNS.join(','),
    PREVIOUS_SOFTBALL_CSV_COLUMNS.join(',')
  ])
  if (!supportedPreviousHeaders.has(firstLine)) {
    throw new Error(
      `Unsupported softball CSV schema at ${softballCsvPath}; existing data was preserved`
    )
  }

  const migratedContent = migrateLegacySoftballCsv(legacyContent)
  const backupPath = ensureSoftballMigrationBackup(legacyContent)
  const migrationPath = `${softballCsvPath}.migration.tmp`
  fs.writeFileSync(migrationPath, migratedContent, 'utf8')
  fs.renameSync(migrationPath, softballCsvPath)
  console.log(`Softball CSV migrated. Original file saved to: ${backupPath}`)
}

function ensureSoftballMigrationBackup(legacyContent) {
  const backupBase = path.join(dataDir, 'submissions_softbol_afiliados_2026_schema_backup')
  for (let suffix = 0; ; suffix += 1) {
    const backupPath = `${backupBase}${suffix === 0 ? '' : `_${suffix + 1}`}.csv`
    if (fs.existsSync(backupPath)) {
      if (fs.readFileSync(backupPath, 'utf8') === legacyContent) return backupPath
      continue
    }
    fs.copyFileSync(softballCsvPath, backupPath, fs.constants.COPYFILE_EXCL)
    return backupPath
  }
}

function migrateLegacySoftballCsv(legacyContent) {
  const lines = legacyContent.split(/\r?\n/)
  const header = parseCsvLine(lines[0].replace(/^\uFEFF/, ''))
  const migratedRows = []

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const values = parseCsvLine(line)
    if (values.length !== header.length) {
      throw new Error('Unable to safely migrate malformed softball CSV row')
    }
    const legacyRow = Object.fromEntries(header.map((column, index) => [column, values[index]]))
    const folioRegistro = formatSoftballRegistrationFolio(migratedRows.length + 1)
    migratedRows.push(buildSoftballCsvRow({
      ...legacyRow,
      folioRegistro,
      participanteId: `${folioRegistro}.1`,
      modalidadRegistro: 'INDIVIDUAL_HISTORICO',
      cantidadAbonos: header.includes('cantidadAbonos') ? legacyRow.cantidadAbonos : ''
    }).trimEnd())
  }

  return `${SOFTBALL_CSV_COLUMNS.join(',')}\n${migratedRows.join('\n')}${migratedRows.length ? '\n' : ''}`
}

function formatSoftballRegistrationFolio(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('Invalid softball registration sequence')
  }
  return String(sequence).padStart(6, '0')
}

function softballTransactionChecksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function writeBufferFullySync(fileDescriptor, buffer, position) {
  let offset = 0
  while (offset < buffer.length) {
    const bytesWritten = fs.writeSync(
      fileDescriptor,
      buffer,
      offset,
      buffer.length - offset,
      position + offset
    )
    if (bytesWritten < 1) throw new Error('Unable to complete softball CSV transaction')
    offset += bytesWritten
  }
}

function recoverSoftballTransaction() {
  if (!fs.existsSync(softballTransactionPath)) return false
  if (!fs.existsSync(softballCsvPath)) {
    throw new Error('Softball CSV transaction exists without its data file')
  }

  let transaction
  try {
    transaction = JSON.parse(fs.readFileSync(softballTransactionPath, 'utf8'))
  } catch {
    throw new Error('Unable to parse pending softball CSV transaction')
  }

  const buffer = Buffer.from(transaction.rowBlockBase64 || '', 'base64')
  if (
    transaction.version !== 1
    || !Number.isSafeInteger(transaction.originalSize)
    || transaction.originalSize < 0
    || !buffer.length
    || transaction.checksum !== softballTransactionChecksum(buffer)
  ) {
    throw new Error('Invalid pending softball CSV transaction')
  }

  const currentSize = fs.statSync(softballCsvPath).size
  if (currentSize < transaction.originalSize) {
    throw new Error('Softball CSV is shorter than the pending transaction origin')
  }

  const fileDescriptor = fs.openSync(softballCsvPath, 'r+')
  try {
    fs.ftruncateSync(fileDescriptor, transaction.originalSize)
    writeBufferFullySync(fileDescriptor, buffer, transaction.originalSize)
    fs.fsyncSync(fileDescriptor)
  } finally {
    fs.closeSync(fileDescriptor)
  }
  fs.unlinkSync(softballTransactionPath)
  console.log('Recovered pending softball CSV transaction')
  return true
}

function ensureRewardsMigrationBackup(legacyContent) {
  const backupBase = path.join(dataDir, 'submissions_experiencias_recompensas_legacy_backup')
  for (let suffix = 0; ; suffix += 1) {
    const backupPath = `${backupBase}${suffix === 0 ? '' : `_${suffix + 1}`}.csv`
    if (fs.existsSync(backupPath)) {
      if (fs.readFileSync(backupPath, 'utf8') === legacyContent) return backupPath
      continue
    }
    fs.copyFileSync(rewardsCsvPath, backupPath, fs.constants.COPYFILE_EXCL)
    return backupPath
  }
}

function migrateLegacyRewardsCsv(legacyContent) {
  const lines = legacyContent.split(/\r?\n/)
  const header = parseCsvLine(lines[0].replace(/^\uFEFF/, ''))
  const migratedRows = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const values = parseCsvLine(line)
    if (values.length !== header.length) throw new Error('Unable to safely migrate malformed rewards CSV row')
    const legacyRow = Object.fromEntries(header.map((column, index) => [column, values[index]]))
    migratedRows.push(buildRewardsCsvRow({
      ...legacyRow,
      eventosSeleccionados: [],
      participaPapaSobreRuedas: false,
      participaRomeoSantos: false
    }).trimEnd())
  }
  return `${REWARDS_CSV_COLUMNS.join(',')}\n${migratedRows.join('\n')}${migratedRows.length ? '\n' : ''}`
}

function ensureSubscriberMigrationBackup(legacyContent) {
  const backupBase = path.join(
    dataDir,
    'submissions_abonados_lmp_2026_2027_schema_backup'
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

function migrateSubscriberCsv(legacyContent) {
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
      cantidadAbonos: header.includes('cantidadAbonos') ? legacyRow.cantidadAbonos : '',
      tallaJersey1: legacyRow.tallaJersey1 || legacyRow.tallaJersey || ''
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

function buildRewardsCsvRow(payload) {
  return REWARDS_CSV_COLUMNS.map((column) => toCsvValue(payload[column])).join(',') + '\n'
}

function buildSoftballCsvRow(payload) {
  return SOFTBALL_CSV_COLUMNS.map((column) => toCsvValue(payload[column])).join(',') + '\n'
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

function normalizeSoftballParticipantName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleUpperCase('es-MX')
    .replace(/[.'\u2019-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSoftballPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 14 && digits.startsWith('0052')) return digits.slice(4)
  if (digits.length === 13 && digits.startsWith('521')) return digits.slice(3)
  if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2)
  return digits
}

function softballParticipantKey(nombreCompleto, telefono) {
  return `${normalizeSoftballParticipantName(nombreCompleto)}|${normalizeSoftballPhone(telefono)}`
}

function softballSubmissionFingerprint({
  participantKeys,
  cantidadAbonos,
  eventoSeleccionado,
  aceptaAvisoPrivacidad,
  aceptaComunicaciones,
  privacyNoticeVersion
}) {
  return JSON.stringify([
    participantKeys,
    cantidadAbonos,
    eventoSeleccionado,
    aceptaAvisoPrivacidad === true,
    aceptaComunicaciones === true,
    privacyNoticeVersion
  ])
}

function loadSoftballRegistrationRegistry() {
  softballSubmissionRegistry.clear()
  softballParticipantRegistry.clear()
  softballNextRegistrationNumber = 1
  if (!fs.existsSync(softballCsvPath)) return

  const content = fs.readFileSync(softballCsvPath, 'utf8')
  const lines = content.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return

  const header = parseCsvLine(lines[0].replace(/^\uFEFF/, ''))
  const submissionIdIdx = header.indexOf('submissionId')
  const registrationIdIdx = header.indexOf('folioRegistro')
  const participantIdIdx = header.indexOf('participanteId')
  const registrationModeIdx = header.indexOf('modalidadRegistro')
  const nameIdx = header.indexOf('nombreCompleto')
  const phoneIdx = header.indexOf('telefono')
  const seasonTicketsIdx = header.indexOf('cantidadAbonos')
  const eventIdx = header.indexOf('eventoSeleccionado')
  const privacyIdx = header.indexOf('aceptaAvisoPrivacidad')
  const communicationsIdx = header.indexOf('aceptaComunicaciones')
  const privacyVersionIdx = header.indexOf('privacyNoticeVersion')
  if (
    submissionIdIdx < 0
    || registrationIdIdx < 0
    || participantIdIdx < 0
    || registrationModeIdx < 0
    || nameIdx < 0
    || phoneIdx < 0
    || seasonTicketsIdx < 0
    || eventIdx < 0
    || privacyIdx < 0
    || communicationsIdx < 0
    || privacyVersionIdx < 0
  ) {
    throw new Error(`Unable to index softball registrations at ${softballCsvPath}`)
  }

  const groupedSubmissions = new Map()
  const folioOwners = new Map()
  let maxRegistrationNumber = 0

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line)
    if (values.length !== header.length) {
      throw new Error(`Malformed softball CSV row at ${softballCsvPath}`)
    }

    const submissionId = values[submissionIdIdx].trim()
    const folioRegistro = values[registrationIdIdx].trim()
    const participanteId = values[participantIdIdx].trim()
    const modalidadRegistro = values[registrationModeIdx].trim()
    const participantKey = softballParticipantKey(values[nameIdx], values[phoneIdx])
    const participantMatch = participanteId.match(/^(\d{6,})\.(\d+)$/)
    const registrationNumber = Number(folioRegistro)
    const participantSequence = Number(participantMatch?.[2])
    const rawSeasonTicketQuantity = values[seasonTicketsIdx].trim()
    const seasonTicketQuantity = rawSeasonTicketQuantity
      ? Number(rawSeasonTicketQuantity)
      : ''
    if (
      !submissionId
      || participantKey === '|'
      || !/^\d{6,}$/.test(folioRegistro)
      || !participantMatch
      || participantMatch[1] !== folioRegistro
      || !Number.isSafeInteger(registrationNumber)
      || registrationNumber < 1
      || !Number.isSafeInteger(participantSequence)
      || participantSequence < 1
      || participanteId !== `${folioRegistro}.${participantSequence}`
      || !SOFTBALL_REGISTRATION_MODES.has(modalidadRegistro)
      || (rawSeasonTicketQuantity && (
        !Number.isInteger(seasonTicketQuantity)
        || seasonTicketQuantity < 1
        || seasonTicketQuantity > SOFTBALL_MAX_SEASON_TICKETS
      ))
    ) {
      throw new Error(`Incomplete softball CSV row at ${softballCsvPath}`)
    }
    maxRegistrationNumber = Math.max(maxRegistrationNumber, registrationNumber)

    const currentFolioOwner = folioOwners.get(folioRegistro)
    if (currentFolioOwner && currentFolioOwner !== submissionId) {
      throw new Error(`Conflicting softball registration folio at ${softballCsvPath}`)
    }
    folioOwners.set(folioRegistro, submissionId)

    const sharedFields = {
      cantidadAbonos: seasonTicketQuantity,
      modalidadRegistro,
      eventoSeleccionado: values[eventIdx].trim(),
      aceptaAvisoPrivacidad: values[privacyIdx].trim().toLowerCase() === 'true',
      aceptaComunicaciones: values[communicationsIdx].trim().toLowerCase() === 'true',
      privacyNoticeVersion: values[privacyVersionIdx].trim()
    }
    const existingGroup = groupedSubmissions.get(submissionId)
    if (existingGroup) {
      if (
        existingGroup.folioRegistro !== folioRegistro
        || JSON.stringify(existingGroup.sharedFields) !== JSON.stringify(sharedFields)
        || existingGroup.participants.some((participant) => participant.participanteId === participanteId)
      ) {
        throw new Error(`Conflicting softball submission ID at ${softballCsvPath}`)
      }
      existingGroup.participants.push({
        participantKey,
        participanteId,
        participantSequence
      })
    } else {
      groupedSubmissions.set(submissionId, {
        folioRegistro,
        sharedFields,
        participants: [{
          participantKey,
          participanteId,
          participantSequence
        }]
      })
    }

    softballParticipantRegistry.add(participantKey)
  }

  for (const [submissionId, group] of groupedSubmissions) {
    group.participants.sort((left, right) => left.participantSequence - right.participantSequence)
    const participantKeys = group.participants.map((participant) => participant.participantKey)
    const participanteIds = group.participants.map((participant) => participant.participanteId)
    if (
      new Set(participantKeys).size !== participantKeys.length
      || group.participants.some((participant, index) => participant.participantSequence !== index + 1)
      || (
        group.sharedFields.modalidadRegistro === 'MULTIPARTICIPANTE'
        && group.sharedFields.cantidadAbonos !== group.participants.length
      )
      || (
        group.sharedFields.modalidadRegistro !== 'MULTIPARTICIPANTE'
        && group.participants.length !== 1
      )
    ) {
      throw new Error(`Incomplete softball submission group at ${softballCsvPath}`)
    }
    softballSubmissionRegistry.set(submissionId, {
      fingerprint: softballSubmissionFingerprint({
        participantKeys,
        ...group.sharedFields
      }),
      folioRegistro: group.folioRegistro,
      participanteIds
    })
  }
  softballNextRegistrationNumber = maxRegistrationNumber + 1
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

function normalizeRewardsPayload(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const timestamp = new Date().toISOString()
  const eventosSeleccionados = Array.isArray(raw.eventosSeleccionados)
    ? [...new Set(raw.eventosSeleccionados.filter((value) => typeof value === 'string').map((value) => value.trim()))]
    : []
  return {
    submissionId: typeof raw.submissionId === 'string' && raw.submissionId.trim()
      ? raw.submissionId.trim()
      : randomUUID(),
    timestamp,
    campaignName: 'Club Charros · Experiencias y Recompensas',
    source: 'club-charros-rewards',
    nombreCompleto: typeof raw.nombreCompleto === 'string'
      ? raw.nombreCompleto.trim().toLocaleUpperCase('es-MX')
      : '',
    eventosSeleccionados,
    participaPapaSobreRuedas: eventosSeleccionados.includes('papa-sobre-ruedas-2026'),
    participaRomeoSantos: eventosSeleccionados.includes('romeo-santos-live-mexico-2026'),
    recomendacion: typeof raw.recomendacion === 'string' ? raw.recomendacion.trim() : '',
    aceptaAvisoPrivacidad: raw.aceptaAvisoPrivacidad === true,
    aceptaComunicaciones: raw.aceptaComunicaciones === true,
    privacyNoticeVersion: '2026-10-20',
    consentTimestamp: timestamp
  }
}

function validateRewardsPayload(payload) {
  const invalid = []
  if (payload.nombreCompleto.length < 5 || payload.nombreCompleto.length > 140 || !payload.nombreCompleto.includes(' ')) {
    invalid.push('nombreCompleto')
  }
  if (payload.eventosSeleccionados.length < 1 || payload.eventosSeleccionados.length > 2 || payload.eventosSeleccionados.some((id) => !REWARD_EVENT_IDS.has(id))) {
    invalid.push('eventosSeleccionados')
  }
  if (payload.recomendacion.length < 5 || payload.recomendacion.length > 1200) {
    invalid.push('recomendacion')
  }
  if (payload.aceptaAvisoPrivacidad !== true) invalid.push('aceptaAvisoPrivacidad')
  return { valid: invalid.length === 0, invalid }
}

function normalizeSoftballPayload(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const timestamp = new Date().toISOString()
  const hasSubmissionId = Object.hasOwn(raw, 'submissionId')
  const rawSubmissionId = typeof raw.submissionId === 'string' ? raw.submissionId.trim() : ''
  const hasParticipantList = Object.hasOwn(raw, 'participantes')
  const participantInputs = hasParticipantList && Array.isArray(raw.participantes)
    ? raw.participantes
    : [{ nombreCompleto: raw.nombreCompleto, telefono: raw.telefono }]
  const participants = participantInputs.map((participantInput) => {
    const participant = participantInput
      && typeof participantInput === 'object'
      && !Array.isArray(participantInput)
      ? participantInput
      : {}
    const rawName = typeof participant.nombreCompleto === 'string'
      ? participant.nombreCompleto
      : ''
    const rawPhone = typeof participant.telefono === 'string' ? participant.telefono : ''
    const nombreCompleto = rawName.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-MX')
    const telefono = rawPhone.trim()
    return {
      nombreCompleto,
      telefono,
      participantKey: softballParticipantKey(nombreCompleto, telefono),
      nameTypeValid: typeof participant.nombreCompleto === 'string'
        && !/[\u0000-\u001f\u007f]/.test(participant.nombreCompleto),
      phoneTypeValid: typeof participant.telefono === 'string'
        && !/[\u0000-\u001f\u007f]/.test(participant.telefono)
    }
  })
  const eventoSeleccionado = typeof raw.eventoSeleccionado === 'string'
    ? raw.eventoSeleccionado.trim()
    : ''
  const aceptaAvisoPrivacidad = raw.aceptaAvisoPrivacidad === true
  const aceptaComunicaciones = raw.aceptaComunicaciones === true
  const cantidadAbonos = Number.isInteger(raw.cantidadAbonos) ? raw.cantidadAbonos : ''
  const modalidadRegistro = hasParticipantList
    ? 'MULTIPARTICIPANTE'
    : 'INDIVIDUAL_COMPATIBILIDAD'
  const participantKeys = participants.map((participant) => participant.participantKey)

  return {
    submissionId: hasSubmissionId ? rawSubmissionId : randomUUID(),
    timestamp,
    campaignName: SOFTBALL_CAMPAIGN_NAME,
    source: SOFTBALL_SOURCE,
    nombreCompleto: participants[0]?.nombreCompleto || '',
    telefono: participants[0]?.telefono || '',
    participants,
    participantKeys,
    modalidadRegistro,
    cantidadAbonos,
    eventoSeleccionado,
    aceptaAvisoPrivacidad,
    aceptaComunicaciones,
    privacyNoticeVersion: SOFTBALL_PRIVACY_NOTICE_VERSION,
    consentTimestamp: timestamp,
    submissionFingerprint: softballSubmissionFingerprint({
      participantKeys,
      cantidadAbonos,
      modalidadRegistro,
      eventoSeleccionado,
      aceptaAvisoPrivacidad,
      aceptaComunicaciones,
      privacyNoticeVersion: SOFTBALL_PRIVACY_NOTICE_VERSION
    }),
    submissionIdTypeValid: !hasSubmissionId || (
      typeof raw.submissionId === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(rawSubmissionId)
    ),
    participantListTypeValid: !hasParticipantList || Array.isArray(raw.participantes),
    seasonTicketQuantityTypeValid: Number.isInteger(raw.cantidadAbonos)
      && raw.cantidadAbonos >= 1
      && raw.cantidadAbonos <= SOFTBALL_MAX_SEASON_TICKETS,
    participantCountValid: !hasParticipantList || participants.length === raw.cantidadAbonos,
    privacyTypeValid: typeof raw.aceptaAvisoPrivacidad === 'boolean',
    communicationsTypeValid:
      raw.aceptaComunicaciones === undefined || typeof raw.aceptaComunicaciones === 'boolean'
  }
}

function validateSoftballPayload(payload) {
  const invalid = []
  const namePattern = /^[\p{L}\p{M}][\p{L}\p{M} .'\u2019-]*$/u
  const phonePattern = /^\+?[0-9() .-]+$/

  if (!payload.submissionIdTypeValid) invalid.push('submissionId')
  if (!payload.participantListTypeValid || payload.participants.length < 1) {
    invalid.push('participantes')
  } else {
    payload.participants.forEach((participant, index) => {
      const nameParts = participant.nombreCompleto
        .split(' ')
        .filter((part) => /\p{L}/u.test(part))
      const invalidName = !participant.nameTypeValid
        || participant.nombreCompleto.length < 5
        || participant.nombreCompleto.length > 140
        || nameParts.length < 2
        || !namePattern.test(participant.nombreCompleto)
      const invalidPhone = !participant.phoneTypeValid
        || participant.telefono.length > 32
        || !phonePattern.test(participant.telefono)
        || normalizeSoftballPhone(participant.telefono).length !== 10
      if (invalidName) {
        invalid.push(payload.modalidadRegistro === 'MULTIPARTICIPANTE'
          ? `participantes.${index}.nombreCompleto`
          : 'nombreCompleto')
      }
      if (invalidPhone) {
        invalid.push(payload.modalidadRegistro === 'MULTIPARTICIPANTE'
          ? `participantes.${index}.telefono`
          : 'telefono')
      }
    })
  }
  if (!payload.seasonTicketQuantityTypeValid) invalid.push('cantidadAbonos')
  if (!payload.participantCountValid) invalid.push('participantes')
  if (new Set(payload.participantKeys).size !== payload.participantKeys.length) {
    invalid.push('participantes')
  }
  if (payload.eventoSeleccionado !== SOFTBALL_EVENT_ID) invalid.push('eventoSeleccionado')
  if (!payload.privacyTypeValid || payload.aceptaAvisoPrivacidad !== true) {
    invalid.push('aceptaAvisoPrivacidad')
  }
  if (!payload.communicationsTypeValid) invalid.push('aceptaComunicaciones')

  return { valid: invalid.length === 0, invalid }
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
  const cantidadAbonos = raw.cantidadAbonos
  const unidadesAbono = Array.isArray(raw.unidadesAbono) ? raw.unidadesAbono.map((unit) => {
    const source = unit && typeof unit === 'object' && !Array.isArray(unit) ? unit : {}
    return {
      zona: typeof source.zona === 'string' ? source.zona.trim().toUpperCase() : '',
      tallaJersey: typeof source.tallaJersey === 'string' ? source.tallaJersey.trim().toUpperCase() : '',
      personalizacionTexto: typeof source.personalizacionTexto === 'string'
        ? source.personalizacionTexto.trim().toLocaleUpperCase('es-MX') : '',
      personalizacionNumero: typeof source.personalizacionNumero === 'string'
        ? source.personalizacionNumero.trim() : ''
    }
  }) : raw.unidadesAbono

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
    unidadesAbono,
    ...Object.fromEntries(SUBSCRIBER_ZONE_CSV_COLUMNS.map((column, index) => [column, Array.isArray(unidadesAbono) ? unidadesAbono[index]?.zona || '' : ''])),
    ...Object.fromEntries(
      SUBSCRIBER_JERSEY_CSV_COLUMNS.map((column, index) => [
        column, Array.isArray(unidadesAbono) ? unidadesAbono[index]?.tallaJersey || '' : ''
      ])
    ),
    ...Object.fromEntries(SUBSCRIBER_PERSONALIZATION_TEXT_CSV_COLUMNS.map((column, index) => [column, Array.isArray(unidadesAbono) ? unidadesAbono[index]?.personalizacionTexto || '' : ''])),
    ...Object.fromEntries(SUBSCRIBER_PERSONALIZATION_NUMBER_CSV_COLUMNS.map((column, index) => [column, Array.isArray(unidadesAbono) ? unidadesAbono[index]?.personalizacionNumero || '' : ''])),
    boletoMovilLigado: typeof raw.boletoMovilLigado === 'string' ? raw.boletoMovilLigado.trim().toUpperCase() : '',
    boletoMovilId: typeof raw.boletoMovilId === 'string' ? raw.boletoMovilId.trim() : '',
    preferenciaEntrega: typeof raw.preferenciaEntrega === 'string' ? raw.preferenciaEntrega.trim().toUpperCase() : '',
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
  if (!hasValidTicketCount) invalid.push('cantidadAbonos')

  const hasValidUnits = hasValidTicketCount && Array.isArray(payload.unidadesAbono)
    && payload.unidadesAbono.length === payload.cantidadAbonos
    && payload.unidadesAbono.every((unit) => {
      if (!SUBSCRIBER_ZONES.has(unit.zona)) return false
      if ((unit.zona === 'VIP' || unit.zona === 'PREFERENTE') && !SUBSCRIBER_JERSEY_SIZES.has(unit.tallaJersey)) return false
      if (unit.zona === 'GENERAL' && unit.tallaJersey !== '') return false
      if (!/^(?=.*[A-ZÁÉÍÓÚÜÑ])[A-ZÁÉÍÓÚÜÑ ]{1,10}$/.test(unit.personalizacionTexto)) return false
      return /^\d{1,2}$/.test(unit.personalizacionNumero)
    })
  if (!hasValidUnits) invalid.push('unidadesAbono')
  if (!['SI', 'NO'].includes(payload.boletoMovilLigado)) invalid.push('boletoMovilLigado')
  if (payload.boletoMovilLigado === 'NO') {
    if (!/^\d{1,20}$/.test(payload.boletoMovilId)) invalid.push('boletoMovilId')
    if (!SUBSCRIBER_DELIVERY_PREFERENCES.has(payload.preferenciaEntrega)) invalid.push('preferenciaEntrega')
  } else if (payload.boletoMovilId || payload.preferenciaEntrega) {
    invalid.push('boletoMovilDatosInesperados')
  }
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

function appendRewardsRow(row) {
  const writeOperation = rewardsWriteChain.then(async () => {
    ensureRewardsDataFile()
    await fs.promises.appendFile(rewardsCsvPath, row, 'utf8')
  })
  rewardsWriteChain = writeOperation.catch(() => {})
  return writeOperation
}

async function flushRewardsWrites() {
  await rewardsWriteChain
}

async function writeBufferFully(fileHandle, buffer, position) {
  let offset = 0
  while (offset < buffer.length) {
    const { bytesWritten } = await fileHandle.write(
      buffer,
      offset,
      buffer.length - offset,
      position + offset
    )
    if (bytesWritten < 1) throw new Error('Unable to complete softball CSV transaction')
    offset += bytesWritten
  }
}

async function appendSoftballBatchAtomically(rowBlock) {
  ensureSoftballDataFile()
  if (fs.existsSync(softballTransactionPath)) {
    throw new Error('Pending softball CSV transaction requires startup recovery')
  }

  const buffer = Buffer.from(rowBlock, 'utf8')
  if (!buffer.length) throw new Error('Softball CSV transaction cannot be empty')
  const originalSize = (await fs.promises.stat(softballCsvPath)).size
  const transaction = JSON.stringify({
    version: 1,
    originalSize,
    rowBlockBase64: buffer.toString('base64'),
    checksum: softballTransactionChecksum(buffer)
  })
  const temporaryTransactionPath = `${softballTransactionPath}.${process.pid}.${randomUUID()}.tmp`
  let journalPublished = false

  try {
    const journalHandle = await fs.promises.open(temporaryTransactionPath, 'wx')
    try {
      await journalHandle.writeFile(transaction, 'utf8')
      await journalHandle.sync()
    } finally {
      await journalHandle.close()
    }
    await fs.promises.rename(temporaryTransactionPath, softballTransactionPath)
    journalPublished = true

    const currentSize = (await fs.promises.stat(softballCsvPath)).size
    if (currentSize !== originalSize) {
      throw new Error('Softball CSV changed outside the serialized writer')
    }

    const dataHandle = await fs.promises.open(softballCsvPath, 'r+')
    try {
      await writeBufferFully(dataHandle, buffer, originalSize)
      await dataHandle.sync()
    } finally {
      await dataHandle.close()
    }
    await fs.promises.unlink(softballTransactionPath)
  } catch (error) {
    await fs.promises.rm(temporaryTransactionPath, { force: true }).catch(() => {})
    if (journalPublished) {
      try {
        const rollbackHandle = await fs.promises.open(softballCsvPath, 'r+')
        try {
          await rollbackHandle.truncate(originalSize)
          await rollbackHandle.sync()
        } finally {
          await rollbackHandle.close()
        }
        await fs.promises.rm(softballTransactionPath, { force: true })
      } catch (rollbackError) {
        console.error('Softball CSV rollback error; startup recovery is required', rollbackError)
      }
    }
    throw error
  }
}

async function flushSoftballWrites() {
  await softballWriteChain
}

async function persistSoftballPayload(payload) {
  const writeOperation = softballWriteChain.then(async () => {
    const existingSubmission = softballSubmissionRegistry.get(payload.submissionId)
    if (existingSubmission) {
      return existingSubmission.fingerprint === payload.submissionFingerprint
        ? { status: 'duplicate-submission', ...existingSubmission }
        : { status: 'submission-conflict' }
    }

    if (payload.participantKeys.some((key) => softballParticipantRegistry.has(key))) {
      return { status: 'duplicate-participant' }
    }

    const folioRegistro = formatSoftballRegistrationFolio(softballNextRegistrationNumber)
    const participanteIds = payload.participants.map((_, index) => `${folioRegistro}.${index + 1}`)
    const rowBlock = payload.participants.map((participant, index) => buildSoftballCsvRow({
      ...payload,
      folioRegistro,
      participanteId: participanteIds[index],
      nombreCompleto: participant.nombreCompleto,
      telefono: participant.telefono
    })).join('')

    await appendSoftballBatchAtomically(rowBlock)

    const storedSubmission = {
      fingerprint: payload.submissionFingerprint,
      folioRegistro,
      participanteIds
    }
    softballSubmissionRegistry.set(payload.submissionId, storedSubmission)
    payload.participantKeys.forEach((key) => softballParticipantRegistry.add(key))
    softballNextRegistrationNumber += 1
    return { status: 'stored', ...storedSubmission }
  })

  softballWriteChain = writeOperation.catch(() => {})
  return writeOperation
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

function requireRewardsFormEnabled(_req, res, next) {
  if (rewardsFormEnabled) return next()
  res.setHeader('Cache-Control', 'no-store')
  return res.status(503).json({ ok: false, error: 'Rewards form is temporarily disabled' })
}

function requireSoftballFormEnabled(_req, res, next) {
  if (softballFormEnabled) return next()
  res.setHeader('Cache-Control', 'no-store')
  return res.status(503).json({ ok: false, error: 'Softball form is temporarily disabled' })
}

function requireSoftballRegistrationOpen(_req, res, next) {
  if (Date.now() < softballRegistrationDeadlineMs) return next()
  res.setHeader('Cache-Control', 'no-store')
  return res.status(410).json({
    ok: false,
    error: 'Softball registration is closed',
    deadline: softballRegistrationDeadline
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
    release: 'subscriber-personalization-v1',
    publicFormsEnabled,
    subscriberFormEnabled,
    rewardsFormEnabled,
    softballFormEnabled,
    softballRegistrationOpen: softballFormEnabled && Date.now() < softballRegistrationDeadlineMs,
    softballRegistrationDeadline,
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

app.post('/api/rewards-submit', requireRewardsFormEnabled, submitLimiter, async (req, res) => {
  const payload = normalizeRewardsPayload(req.body)
  const validation = validateRewardsPayload(payload)

  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: 'Invalid rewards fields', invalid: validation.invalid })
  }

  if (markAndCheckDuplicate(payload.submissionId)) {
    return res.status(200).json({ ok: true, stored: false, duplicate: true })
  }

  try {
    await appendRewardsRow(buildRewardsCsvRow(payload))
    return res.status(201).json({ ok: true, stored: true, submissionId: payload.submissionId })
  } catch (error) {
    console.error('Rewards CSV persistence error', error)
    return res.status(500).json({ ok: false, error: 'Unable to persist rewards submission' })
  }
})

app.post(
  '/api/softball-submit',
  requireSoftballFormEnabled,
  requireSoftballRegistrationOpen,
  submitLimiter,
  async (req, res) => {
  const payload = normalizeSoftballPayload(req.body)
  const validation = validateSoftballPayload(payload)

  if (!validation.valid) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid softball registration fields',
      invalid: validation.invalid
    })
  }

  try {
    const result = await persistSoftballPayload(payload)

    if (result.status === 'duplicate-submission') {
      return res.status(200).json({
        ok: true,
        stored: false,
        duplicate: true,
        submissionId: payload.submissionId,
        folioRegistro: result.folioRegistro,
        participanteIds: result.participanteIds
      })
    }

    if (result.status === 'submission-conflict') {
      return res.status(409).json({
        ok: false,
        error: 'Softball submission ID already used',
        detail: 'Este identificador de env\u00edo ya fue utilizado para otro registro.'
      })
    }

    if (result.status === 'duplicate-participant') {
      return res.status(409).json({
        ok: false,
        error: 'Softball participant already registered',
        detail: 'Esta persona ya tiene un registro para el partido de s\u00f3ftbol.'
      })
    }

    return res.status(201).json({
      ok: true,
      stored: true,
      submissionId: payload.submissionId,
      folioRegistro: result.folioRegistro,
      participanteIds: result.participanteIds
    })
  } catch (error) {
    console.error('Softball CSV persistence error', error)
    return res.status(500).json({
      ok: false,
      error: 'Unable to persist softball registration'
    })
  }
  }
)

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

app.get('/api/rewards-submissions.csv', requireCsvExportToken, async (_req, res) => {
  try {
    await flushRewardsWrites()
    ensureRewardsDataFile()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="submissions_experiencias_recompensas.csv"')
    return fs.createReadStream(rewardsCsvPath).pipe(res)
  } catch (error) {
    console.error('Rewards CSV download error', error)
    return res.status(500).json({ ok: false, error: 'Unable to read rewards CSV' })
  }
})

app.get('/api/softball-submissions.csv', requireCsvExportToken, async (_req, res) => {
  try {
    await flushSoftballWrites()
    ensureSoftballDataFile()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="submissions_softbol_afiliados_2026.csv"'
    )
    return fs.createReadStream(softballCsvPath).pipe(res)
  } catch (error) {
    console.error('Softball CSV download error', error)
    return res.status(500).json({
      ok: false,
      error: 'Unable to read softball CSV'
    })
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
  ensureRewardsDataFile()
  recoverSoftballTransaction()
  ensureSoftballDataFile()
  loadLeadDailyEmailRegistry()
  loadSubscriberEmailRegistry()
  loadSoftballRegistrationRegistry()
} catch (error) {
  console.error('CSV init error', error)
  throw error
}

let isShuttingDown = false

async function shutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`${signal} received; stopping new requests and flushing CSV writes`)

  let exitCode = 0
  try {
    const closeError = await new Promise((resolve) => {
      httpServer.close((error) => resolve(error || null))
      httpServer.closeIdleConnections?.()
    })
    if (closeError) throw closeError

    await flushQueue()
    await flushLeadQueue()
    await flushSubscriberWrites()
    await flushRewardsWrites()
    await flushSoftballWrites()
  } catch (error) {
    exitCode = 1
    console.error('Graceful shutdown error', error)
  } finally {
    process.exit(exitCode)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

const httpServer = app.listen(port, () => {
  console.log(`Submission API listening on port ${port}`)
  console.log(`CSV storage path: ${csvPath}`)
  console.log(`Subscriber CSV storage path: ${subscriberCsvPath}`)
  console.log(`Softball CSV storage path: ${softballCsvPath}`)
})
