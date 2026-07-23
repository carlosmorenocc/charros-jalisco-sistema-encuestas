export const MAX_PARTICIPANTS = 3000

const HEADER_ALIASES = {
  name: ['nombre', 'name', 'participante', 'nombre_completo', 'nombres'],
  id: ['id_participante', 'id', 'folio', 'participant_id', 'numero_participante', 'clave'],
  ticket: ['id_boleto', 'boleto', 'ticket', 'ticket_id']
}

export class CsvValidationError extends Error {
  constructor(message, code = 'INVALID_CSV', details = {}) {
    super(message)
    this.name = 'CsvValidationError'
    this.code = code
    this.details = details
  }
}

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFC')
}

function identityText(value) {
  return normalizeText(value).toLocaleLowerCase('es-MX')
}

function countDelimitersInFirstRecord(source) {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '"') {
      if (quoted && next === '"') {
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (!quoted && (char === '\n' || char === '\r')) break
    if (!quoted && Object.hasOwn(counts, char)) counts[char] += 1
  }

  return counts
}

function detectDelimiter(source) {
  const counts = countDelimitersInFirstRecord(source)
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0]
}

export function parseCsvRows(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new CsvValidationError('El archivo CSV está vacío.', 'EMPTY_FILE')
  }

  const source = input.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(source)
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  const pushField = () => {
    row.push(field)
    field = ''
  }

  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"'
        index += 1
      } else if (quoted) {
        quoted = false
      } else if (field.length === 0) {
        quoted = true
      } else {
        field += char
      }
      continue
    }

    if (!quoted && char === delimiter) {
      pushField()
      continue
    }

    if (!quoted && (char === '\n' || char === '\r')) {
      pushRow()
      if (char === '\r' && next === '\n') index += 1
      continue
    }

    field += char
  }

  if (quoted) {
    throw new CsvValidationError(
      'El CSV contiene una comilla abierta sin cierre.',
      'UNCLOSED_QUOTE'
    )
  }

  if (field.length > 0 || row.length > 0) pushRow()

  return { rows, delimiter }
}

function findColumn(headers, aliases) {
  const normalized = headers.map(normalizeHeader)
  return normalized.findIndex((header) => aliases.includes(header))
}

export function parseParticipantCsv(input) {
  const { rows, delimiter } = parseCsvRows(input)

  if (rows.length < 2) {
    throw new CsvValidationError(
      'El CSV necesita encabezados y al menos una fila de participantes.',
      'NO_DATA_ROWS'
    )
  }

  const headers = rows[0].map((header) => normalizeText(header))
  const nameIndex = findColumn(headers, HEADER_ALIASES.name)
  const idIndex = findColumn(headers, HEADER_ALIASES.id)
  const ticketIndex = findColumn(headers, HEADER_ALIASES.ticket)

  if (nameIndex < 0) {
    throw new CsvValidationError(
      'No encontré una columna de nombres. Usa “nombre”, “name” o “participante”.',
      'MISSING_NAME_COLUMN',
      { headers }
    )
  }

  const participants = []
  const warnings = []
  const seenPeople = new Set()
  let duplicateRows = 0
  let emptyRows = 0
  let rejectedRows = 0

  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index]
    const rowNumber = index + 1

    if (values.every((value) => !normalizeText(value))) {
      emptyRows += 1
      continue
    }

    const name = normalizeText(values[nameIndex])
    if (!name || name.length > 120) {
      rejectedRows += 1
      continue
    }

    const sourceId = idIndex >= 0 ? normalizeText(values[idIndex]) : ''
    const ticket = ticketIndex >= 0 ? normalizeText(values[ticketIndex]) : ''
    const personKey = sourceId
      ? `id:${identityText(sourceId)}`
      : `name:${identityText(name)}`

    if (seenPeople.has(personKey)) {
      duplicateRows += 1
      continue
    }

    seenPeople.add(personKey)
    participants.push({
      id: sourceId || `fila-${rowNumber}`,
      name,
      ticket,
      rowNumber
    })

    if (participants.length > MAX_PARTICIPANTS) {
      throw new CsvValidationError(
        `El archivo supera el máximo de ${MAX_PARTICIPANTS.toLocaleString('es-MX')} participantes únicos.`,
        'TOO_MANY_PARTICIPANTS',
        { maximum: MAX_PARTICIPANTS }
      )
    }
  }

  if (participants.length === 0) {
    throw new CsvValidationError(
      'No encontré participantes válidos en el archivo.',
      'NO_VALID_PARTICIPANTS'
    )
  }

  if (idIndex < 0) {
    warnings.push(
      'El archivo no incluye un identificador. Los nombres repetidos se consideran la misma persona.'
    )
  }

  if (duplicateRows > 0) {
    warnings.push(
      `${duplicateRows.toLocaleString('es-MX')} fila(s) duplicada(s) se consolidaron para conservar una oportunidad por persona.`
    )
  }

  if (rejectedRows > 0) {
    warnings.push(
      `${rejectedRows.toLocaleString('es-MX')} fila(s) sin nombre válido fueron descartadas.`
    )
  }

  if (participants.length < 500) {
    warnings.push(
      'La base contiene menos de 500 participantes. Es válida para pruebas, pero está por debajo del rango operativo previsto.'
    )
  }

  return {
    participants,
    headers,
    delimiter,
    stats: {
      inputRows: rows.length - 1,
      validParticipants: participants.length,
      duplicateRows,
      emptyRows,
      rejectedRows
    },
    warnings
  }
}
