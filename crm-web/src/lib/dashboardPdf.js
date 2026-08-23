const PAGE_WIDTH = 842
const PAGE_HEIGHT = 595

const COLORS = Object.freeze({
  navy: [0.055, 0.184, 0.345],
  blue: [0.082, 0.322, 0.565],
  lightBlue: [0.925, 0.957, 0.984],
  gold: [0.82, 0.596, 0.176],
  green: [0.125, 0.518, 0.353],
  red: [0.714, 0.176, 0.184],
  violet: [0.376, 0.286, 0.635],
  ink: [0.071, 0.118, 0.196],
  muted: [0.38, 0.424, 0.494],
  line: [0.855, 0.878, 0.91],
  surface: [0.965, 0.973, 0.982],
  white: [1, 1, 1],
})

const PERIOD_LABELS = Object.freeze({
  today: 'Hoy',
  week: 'Semanal',
  month: 'Mensual',
  custom: 'Rango personalizado',
  all: 'Todo el tiempo',
})

const WINDOWS_1252 = Object.freeze({
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
})

function asNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(value, limit) {
  const text = normalizeText(value)
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text
}

function hexText(value) {
  const bytes = []
  for (const character of normalizeText(value)) {
    const codePoint = character.codePointAt(0)
    if (WINDOWS_1252[character] !== undefined) bytes.push(WINDOWS_1252[character])
    else if (codePoint <= 0xff) bytes.push(codePoint)
    else bytes.push(0x3f)
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function color(values) {
  return values.map((value) => Number(value).toFixed(3)).join(' ')
}

function rect(x, y, width, height, fill, stroke = null, lineWidth = 1) {
  const commands = ['q']
  if (fill) commands.push(`${color(fill)} rg`)
  if (stroke) commands.push(`${color(stroke)} RG`, `${lineWidth} w`)
  commands.push(`${x} ${y} ${width} ${height} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`, 'Q')
  return commands.join('\n')
}

function line(x1, y1, x2, y2, stroke, lineWidth = 1) {
  return `q\n${color(stroke)} RG\n${lineWidth} w\n${x1} ${y1} m ${x2} ${y2} l S\nQ`
}

function arcStroke(cx, cy, radius, start, end, stroke, lineWidth = 12) {
  const span = Math.max(0, end - start)
  const steps = Math.max(2, Math.ceil(span / (Math.PI / 24)))
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = start + span * (index / steps) - Math.PI / 2
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]
  })
  const [first, ...rest] = points
  return `q\n${color(stroke)} RG\n${lineWidth} w\n${first[0].toFixed(2)} ${first[1].toFixed(2)} m\n${rest.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)} l`).join('\n')}\nS\nQ`
}

function text(value, x, y, { font = 'F1', size = 10, fill = COLORS.ink } = {}) {
  return `BT\n/${font} ${size} Tf\n${color(fill)} rg\n1 0 0 1 ${x} ${y} Tm\n<${hexText(value)}> Tj\nET`
}

function formatInteger(value) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(asNumber(value))
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(asNumber(value))
}

function formatGeneratedAt(value) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function formatSeason(value) {
  if (value === 'LMP-2026-27') return 'LMP 2026-2027'
  return normalizeText(value) || 'Sin especificar'
}

function sanitizeFilenamePart(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export function buildDashboardPdfFilename({ season, period, isDemo = false, generatedAt = new Date() }) {
  const localDate = [
    generatedAt.getFullYear(),
    String(generatedAt.getMonth() + 1).padStart(2, '0'),
    String(generatedAt.getDate()).padStart(2, '0'),
  ].join('-')
  const seasonPart = sanitizeFilenamePart(season) || 'temporada'
  const periodPart = sanitizeFilenamePart(PERIOD_LABELS[period] || period) || 'periodo'
  return `${isDemo ? 'demo-' : ''}reporte-direccion-${seasonPart}-${periodPart}-${localDate}.pdf`
}

function readJpegDimensions(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('El logotipo no tiene un formato JPEG válido.')
  }

  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue
    if (offset + 1 >= bytes.length) break
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isStartOfFrame && length >= 7 && offset + length <= bytes.length) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      }
    }
    if (length < 2) break
    offset += length
  }
  throw new Error('No fue posible leer las dimensiones del logotipo.')
}

function encode(value) {
  return new TextEncoder().encode(value)
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function pdfObject(number, body) {
  const bodyBytes = typeof body === 'string' ? encode(body) : body
  return concatBytes([encode(`${number} 0 obj\n`), bodyBytes, encode('\nendobj\n')])
}

function buildPdfDocument({ content, logoBytes, logoWidth, logoHeight, generatedAt }) {
  const contentBytes = encode(content)
  const imageStream = concatBytes([
    encode(`<< /Type /XObject /Subtype /Image /Width ${logoWidth} /Height ${logoHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`),
    logoBytes,
    encode('\nendstream'),
  ])
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 7 0 R >>`),
    pdfObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    pdfObject(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    pdfObject(6, imageStream),
    pdfObject(7, concatBytes([encode(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, encode('\nendstream')])),
    pdfObject(8, `<< /Title <${hexText('Reporte Dirección · CRM Abonados')}> /Author <${hexText('Club Charros de Jalisco')}> /Subject <${hexText('Reporte ejecutivo confidencial')}> /CreationDate (D:${generatedAt.getFullYear()}${String(generatedAt.getMonth() + 1).padStart(2, '0')}${String(generatedAt.getDate()).padStart(2, '0')}${String(generatedAt.getHours()).padStart(2, '0')}${String(generatedAt.getMinutes()).padStart(2, '0')}00) >>`),
  ]
  const header = encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const offsets = []
  let position = header.length
  for (const object of objects) {
    offsets.push(position)
    position += object.length
  }
  const xrefOffset = position
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R /Info 8 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n')
  return concatBytes([header, ...objects, encode(xref)])
}

function drawMetric(commands, { x, y, width, label, value, accent }) {
  commands.push(rect(x, y, width, 61, COLORS.white, COLORS.line))
  commands.push(rect(x, y + 57, width, 4, accent))
  commands.push(text(truncate(label.toUpperCase(), 25), x + 10, y + 42, { font: 'F2', size: 6.8, fill: COLORS.muted }))
  commands.push(text(truncate(value, 18), x + 10, y + 19, { font: 'F2', size: 15.5, fill: COLORS.ink }))
}

function drawPanelHeading(commands, x, y, kicker, heading) {
  commands.push(text(kicker.toUpperCase(), x, y, { font: 'F2', size: 6.8, fill: COLORS.blue }))
  commands.push(text(heading, x, y - 17, { font: 'F2', size: 11.5, fill: COLORS.ink }))
}

function createContentStream(report, logoDimensions) {
  const { summary = {}, operation = {}, filters = {}, generatedAt, isDemo = false } = report
  const totalContacts = Math.max(1, asNumber(summary.totalContacts))
  const currentSubscribers = asNumber(summary.currentSubscribers)
  const commands = [rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, COLORS.surface)]

  commands.push(rect(0, 575, PAGE_WIDTH, 20, COLORS.navy))
  const logoBoxWidth = 59
  const logoBoxHeight = 46
  const logoRatio = logoDimensions.width / logoDimensions.height
  const drawWidth = Math.min(logoBoxWidth, logoBoxHeight * logoRatio)
  const drawHeight = drawWidth / logoRatio
  commands.push(`q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} 36 ${(510 + (logoBoxHeight - drawHeight) / 2).toFixed(2)} cm\n/Im1 Do\nQ`)
  commands.push(text('CRM ABONADOS', 111, 551, { font: 'F2', size: 18, fill: COLORS.navy }))
  commands.push(text('REPORTE DIRECCIÓN', 111, 534, { font: 'F2', size: 8, fill: COLORS.gold }))
  commands.push(text(`Generado: ${formatGeneratedAt(generatedAt)}`, 635, 550, { size: 8, fill: COLORS.muted }))
  commands.push(text('Club Charros de Jalisco', 670, 535, { font: 'F2', size: 8, fill: COLORS.navy }))
  if (isDemo) {
    commands.push(rect(537, 514, 269, 16, COLORS.gold))
    commands.push(text('DATOS SINTÉTICOS · NO USAR PARA DECISIONES', 548, 519, { font: 'F2', size: 6.8, fill: COLORS.white }))
  }
  commands.push(line(36, 506, 806, 506, COLORS.line))

  commands.push(rect(36, 466, 770, 29, COLORS.lightBlue))
  commands.push(text('TEMPORADA', 49, 484, { font: 'F2', size: 6.5, fill: COLORS.blue }))
  commands.push(text(truncate(formatSeason(filters.season), 22), 49, 473, { font: 'F2', size: 8.5, fill: COLORS.ink }))
  commands.push(text('PERIODO', 277, 484, { font: 'F2', size: 6.5, fill: COLORS.blue }))
  commands.push(text(truncate(PERIOD_LABELS[filters.period] || filters.period || 'Sin especificar', 26), 277, 473, { font: 'F2', size: 8.5, fill: COLORS.ink }))
  commands.push(text('EJECUTIVO', 500, 484, { font: 'F2', size: 6.5, fill: COLORS.blue }))
  commands.push(text(truncate(filters.executiveName || 'Todos los ejecutivos', 38), 500, 473, { font: 'F2', size: 8.5, fill: COLORS.ink }))

  const metricGap = 7
  const metricWidth = (770 - metricGap * 5) / 6
  const metrics = [
    ['Abonados actuales', formatInteger(currentSubscribers), COLORS.blue],
    ['Abonos Activos', formatInteger(summary.activeSeats), COLORS.violet],
    ['Por renovar', formatInteger(summary.renewing), COLORS.gold],
    ['Titulares N / R', `${formatInteger(summary.newSubscribers)} / ${formatInteger(summary.renewedSubscribers)}`, COLORS.green],
    ['Abonos N / R', `${formatInteger(summary.newSeats)} / ${formatInteger(summary.renewedSeats)}`, COLORS.violet],
    ['Venta documentada', formatCurrency(summary.salesAmount), COLORS.navy],
  ]
  metrics.forEach(([label, value, accent], index) => drawMetric(commands, {
    x: 36 + index * (metricWidth + metricGap),
    y: 389,
    width: metricWidth,
    label,
    value,
    accent,
  }))

  const bodyY = 137
  const bodyHeight = 234
  const leftX = 36
  const leftWidth = 400
  const rightX = 450
  const rightWidth = 356
  commands.push(rect(leftX, bodyY, leftWidth, bodyHeight, COLORS.white, COLORS.line))
  drawPanelHeading(commands, leftX + 16, 352, 'Composición operativa', 'Foto actual de la cartera')
  commands.push(text(`${formatInteger(summary.totalContacts)} registros en alcance`, leftX + 255, 337, { font: 'F2', size: 8, fill: COLORS.blue }))

  const composition = [
    ['Contactos en alcance', asNumber(summary.totalContacts), COLORS.blue],
    ['Abonados actuales', currentSubscribers, COLORS.green],
    ['Por renovar', asNumber(summary.renewing), COLORS.gold],
    ['Abonados nuevos', asNumber(summary.newSubscribers), COLORS.violet],
    ['Prospectos', asNumber(summary.prospects), COLORS.gold],
  ]
  composition.forEach(([label, value, accent], index) => {
    const y = 308 - index * 27
    const percentage = label === 'Contactos en alcance' ? 1 : clamp(value / totalContacts, 0, 1)
    commands.push(text(label, leftX + 16, y + 11, { size: 7.5, fill: COLORS.muted }))
    commands.push(text(formatInteger(value), leftX + 338, y + 11, { font: 'F2', size: 8, fill: COLORS.ink }))
    commands.push(rect(leftX + 16, y, 352, 5, COLORS.line))
    commands.push(rect(leftX + 16, y, Math.max(value > 0 ? 2 : 0, 352 * percentage), 5, accent))
  })
  commands.push(rect(rightX, 255, rightWidth, 116, COLORS.white, COLORS.line))
  drawPanelHeading(commands, rightX + 16, 352, 'Segmentación de la cartera', 'Abonos por segmento')
  const pdfSegments = [['Compromisos', COLORS.red], ['VIP', COLORS.gold], ['Preferente', COLORS.blue], ['General', COLORS.green]]
  const segmentTotal = pdfSegments.reduce((sum, [label]) => sum + asNumber(summary.membershipSegments?.[label]), 0)
  let segmentCursor = 0
  if (segmentTotal > 0) {
    pdfSegments.forEach(([label, accent]) => {
      const start = segmentCursor / segmentTotal * Math.PI * 2
      segmentCursor += asNumber(summary.membershipSegments?.[label])
      const end = segmentCursor / segmentTotal * Math.PI * 2
      commands.push(arcStroke(rightX + 55, 302, 30, start, end, accent, 12))
    })
  } else commands.push(arcStroke(rightX + 55, 302, 30, 0, Math.PI * 2, COLORS.line, 12))
  commands.push(text(formatInteger(segmentTotal), rightX + 43, 300, { font: 'F2', size: 11, fill: COLORS.ink }))
  commands.push(text('ABONOS', rightX + 41, 290, { font: 'F2', size: 5.5, fill: COLORS.muted }))
  pdfSegments.forEach(([label, accent], index) => {
    const x = rightX + 105 + (index % 2) * 110
    const y = 315 - Math.floor(index / 2) * 37
    commands.push(rect(x, y, 7, 7, accent))
    commands.push(text(label.toUpperCase(), x + 13, y + 1, { font: 'F2', size: 6.3, fill: COLORS.muted }))
    commands.push(text(formatInteger(summary.membershipSegments?.[label]), x + 13, y - 13, { font: 'F2', size: 13, fill: COLORS.ink }))
  })

  commands.push(rect(rightX, bodyY, rightWidth, 104, COLORS.white, COLORS.line))
  drawPanelHeading(commands, rightX + 16, 222, 'Operación global del día', 'Seguimientos')
  commands.push(text(formatInteger(operation.scheduled), rightX + 16, 180, { font: 'F2', size: 24, fill: COLORS.navy }))
  commands.push(text('acciones programadas', rightX + 55, 184, { size: 7.5, fill: COLORS.muted }))
  const operationItems = [
    ['Pendientes', operation.pending, COLORS.blue],
    ['Completadas', operation.completed, COLORS.green],
    ['Vencidas', operation.overdue, COLORS.red],
  ]
  operationItems.forEach(([label, value, accent], index) => {
    const x = rightX + 16 + index * 108
    commands.push(rect(x, 149, 5, 5, accent))
    commands.push(text(formatInteger(value), x + 10, 147, { font: 'F2', size: 10, fill: COLORS.ink }))
    commands.push(text(label, x + 10, 138, { size: 6.5, fill: COLORS.muted }))
  })

  commands.push(line(36, 111, 806, 111, COLORS.line))
  commands.push(rect(36, 69, 770, 29, COLORS.lightBlue))
  commands.push(text(isDemo ? 'DATOS SINTÉTICOS · NO USAR PARA DECISIONES' : 'CONFIDENCIAL · USO INTERNO', 49, 86, { font: 'F2', size: 7, fill: isDemo ? COLORS.red : COLORS.navy }))
  commands.push(text(isDemo ? 'Documento de prueba sin datos reales; no representa resultados operativos.' : 'Este documento resume información operativa. No debe compartirse fuera de Club Charros de Jalisco.', 49, 75, { size: 7, fill: COLORS.muted }))
  commands.push(text(isDemo ? 'Fuente: escenario sintético local · Sin datos reales.' : 'Fuente: CRM Abonados · Reportes de órdenes y bases históricas conciliadas.', 36, 47, { size: 6.8, fill: COLORS.muted }))
  commands.push(text('Página 1 de 1', 747, 47, { font: 'F2', size: 6.8, fill: COLORS.muted }))
  return commands.join('\n')
}

export function createExecutiveDashboardPdf({ summary, operation, filters, isDemo = false, generatedAt = new Date(), logoBytes }) {
  if (!(generatedAt instanceof Date) || Number.isNaN(generatedAt.getTime())) throw new Error('La fecha de generación no es válida.')
  const normalizedLogo = logoBytes instanceof Uint8Array ? logoBytes : new Uint8Array(logoBytes || [])
  const logoDimensions = readJpegDimensions(normalizedLogo)
  const report = { summary, operation, filters, generatedAt, isDemo }
  const content = createContentStream(report, logoDimensions)
  const bytes = buildPdfDocument({
    content,
    logoBytes: normalizedLogo,
    logoWidth: logoDimensions.width,
    logoHeight: logoDimensions.height,
    generatedAt,
  })
  return new Blob([bytes], { type: 'application/pdf' })
}

async function fetchLogo(fetchImpl, logoUrl) {
  if (typeof fetchImpl !== 'function') throw new Error('No fue posible cargar el logotipo para el reporte.')
  const response = await fetchImpl(logoUrl, { cache: 'force-cache', credentials: 'same-origin' })
  if (!response?.ok) throw new Error('No fue posible cargar el logotipo para el reporte.')
  return new Uint8Array(await response.arrayBuffer())
}

export async function downloadExecutiveDashboardPdf(report, options = {}) {
  const generatedAt = options.generatedAt || new Date()
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const documentRef = options.documentRef || globalThis.document
  const urlApi = options.urlApi || globalThis.URL
  const logoUrl = options.logoUrl || `${import.meta.env.BASE_URL || '/'}charros-logo.jpeg`
  if (!documentRef?.createElement || !documentRef.body || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL) {
    throw new Error('Este navegador no permite descargar el reporte.')
  }

  const logoBytes = await fetchLogo(fetchImpl, logoUrl)
  const blob = createExecutiveDashboardPdf({ ...report, generatedAt, logoBytes })
  const filename = buildDashboardPdfFilename({ ...report.filters, isDemo: report.isDemo, generatedAt })
  const objectUrl = urlApi.createObjectURL(blob)
  const link = documentRef.createElement('a')
  try {
    link.href = objectUrl
    link.download = filename
    link.rel = 'noopener'
    link.hidden = true
    documentRef.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    urlApi.revokeObjectURL(objectUrl)
  }
  return { blob, filename }
}
