import ExcelJS from 'exceljs'
import crypto from 'node:crypto'

export const ELIGIBLE_PRODUCTS = new Set([
  'Charros de Jalisco: Abono Charros LMP 2026-2027',
  'Charros de Jalisco: Abono General Charros LMP 2026-2027',
  'Charros de Jalisco: Abono VIP Charros LMP 2026-2027',
  'Charros de Jalisco: Abono Preferente Charros LMP 2026-2027'
])

const SALES_REQUIRED = ['NÚMERO DE ORDEN', 'EVENTO', 'ZONA', 'SECCIÓN', 'ASIENTO']
const ACCESS_REQUIRED = ['INGRESO', 'ZONA', 'SECCIÓN', 'ASIENTO', 'TIPO', 'COMPRA', 'EVENTO LIGADO']

function text(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value.text) return String(value.text).trim()
  if (typeof value === 'object' && value.result !== undefined) return text(value.result)
  return String(value).trim()
}

function normalizedHeader(value) {
  return text(value).toLocaleUpperCase('es-MX').normalize('NFC')
}

export function detectHeader(rows, required) {
  for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
    const values = rows[index].map(normalizedHeader)
    if (required.every((label) => values.includes(label))) {
      return { rowIndex: index, columns: Object.fromEntries(values.map((value, column) => [value, column])) }
    }
  }
  throw new Error(`No se detectaron encabezados requeridos: ${required.join(', ')}`)
}

function materialRow(row) {
  return row.some((value) => text(value) && text(value) !== '-')
}

function locationKey(order, zone, section, seat) {
  return [order, zone, section, seat].map((value) => text(value).toLocaleUpperCase('es-MX')).join('|')
}

function exclusionReason(value) {
  const haystack = value.toLocaleUpperCase('es-MX')
  if (haystack.includes('COMPROMISO')) return 'commitment'
  if (haystack.includes('SUITE')) return 'suite'
  if (haystack.includes('PATROCIN')) return 'sponsor'
  return ''
}

export function previewSalesRows(rows) {
  const header = detectHeader(rows, SALES_REQUIRED)
  const get = (row, name) => text(row[header.columns[name]])
  const accepted = []
  const excluded = []
  const review = []
  const seen = new Set()
  for (const row of rows.slice(header.rowIndex + 1)) {
    if (!materialRow(row)) continue
    const order = get(row, 'NÚMERO DE ORDEN')
    const event = get(row, 'EVENTO')
    const zone = get(row, 'ZONA')
    const section = get(row, 'SECCIÓN')
    const seat = get(row, 'ASIENTO')
    if (!order || !zone || !section || !seat) continue
    const excludedBy = exclusionReason(`${event} ${zone} ${get(row, 'PARÁMETRO')} ${get(row, 'EMPRESA')}`)
    if (!ELIGIBLE_PRODUCTS.has(event) || excludedBy) {
      excluded.push({ key: locationKey(order, zone, section, seat), reason: excludedBy || 'ineligible_product' })
      continue
    }
    const key = locationKey(order, zone, section, seat)
    if (seen.has(key)) { review.push({ key, reason: 'duplicate_location' }); continue }
    seen.add(key)
    const price = get(row, 'PRECIO')
    const type = get(row, 'TIPO')
    const flags = []
    if (price === '0' || price === '1' || /COLABORADOR/i.test(type)) flags.push('commercial_eligibility_review')
    accepted.push({ key, order, zone, section, seat, event, flags })
  }
  return { kind: 'sales', accepted, excluded, review }
}

export function previewAccessRows(rows) {
  const header = detectHeader(rows, ACCESS_REQUIRED)
  const get = (row, name) => text(row[header.columns[name]])
  const accepted = []
  const excluded = []
  const review = []
  const seen = new Set()
  for (const row of rows.slice(header.rowIndex + 1)) {
    if (!materialRow(row)) continue
    const type = get(row, 'TIPO')
    const product = get(row, 'EVENTO LIGADO')
    const order = get(row, 'COMPRA')
    const zone = get(row, 'ZONA')
    const section = get(row, 'SECCIÓN')
    const seat = get(row, 'ASIENTO')
    const excludedBy = exclusionReason(`${type} ${product} ${zone} ${get(row, 'PARÁMETRO')} ${get(row, 'PATROCINADOR')}`)
    if (type !== 'Abono' || !ELIGIBLE_PRODUCTS.has(product) || excludedBy) {
      excluded.push({ key: locationKey(order, zone, section, seat), reason: excludedBy || 'ineligible_access' })
      continue
    }
    if (!order || !zone || !section || !seat) { review.push({ reason: 'missing_location' }); continue }
    const key = locationKey(order, zone, section, seat)
    if (seen.has(key)) { review.push({ key, reason: 'duplicate_scan' }); continue }
    seen.add(key)
    accepted.push({ key, order, zone, section, seat, occurredAt: get(row, 'INGRESO'), product })
  }
  return { kind: 'access', accepted, excluded, review }
}

export async function previewRewardWorkbook(buffer, kind) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.subarray(0, 2).toString('hex') !== '504b') {
    throw new Error('El archivo no es un XLSX válido.')
  }
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  if (workbook.worksheets.length !== 1) throw new Error('El reporte debe contener exactamente una hoja.')
  const worksheet = workbook.worksheets[0]
  const rows = []
  worksheet.eachRow({ includeEmpty: true }, (row) => rows.push(row.values.slice(1)))
  const result = kind === 'sales' ? previewSalesRows(rows) : previewAccessRows(rows)
  return { ...result, sha256: crypto.createHash('sha256').update(buffer).digest('hex') }
}
