const AUDIT_VERSION = 'charros-sorteos-v1'

function canonicalRoster(participants) {
  return participants
    .map((participant) => [
      String(participant.id ?? '').normalize('NFC'),
      String(participant.name ?? '').normalize('NFC'),
      String(participant.ticket ?? '').normalize('NFC'),
      Number(participant.rowNumber ?? 0)
    ].join('\u001f'))
    .join('\n')
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashRoster(participants, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.subtle?.digest) {
    throw new Error('Este navegador no permite generar la huella del padrón.')
  }

  const bytes = new TextEncoder().encode(canonicalRoster(participants))
  const digest = await cryptoProvider.subtle.digest('SHA-256', bytes)
  return bytesToHex(digest)
}

export function createDrawRecord({
  winner,
  rosterHash,
  participantCount,
  prize,
  drawNumber,
  drawnAt = new Date().toISOString()
}) {
  if (!winner) throw new Error('Se necesita un ganador para registrar el sorteo.')

  return {
    version: AUDIT_VERSION,
    drawNumber,
    drawnAt,
    prize: String(prize || 'Sorteo Oficial Charros').trim(),
    participantCount,
    rosterHash,
    winner: {
      id: String(winner.id ?? ''),
      name: String(winner.name ?? ''),
      ticket: String(winner.ticket ?? ''),
      rowNumber: Number(winner.rowNumber ?? 0)
    }
  }
}

function neutralizeSpreadsheetFormula(value) {
  const text = String(value ?? '')
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function csvCell(value) {
  const safe = neutralizeSpreadsheetFormula(value)
  return `"${safe.replace(/"/g, '""')}"`
}

export function exportWinnerHistoryCsv(records) {
  const headers = [
    'numero_sorteo',
    'fecha',
    'premio',
    'nombre',
    'id_participante',
    'id_boleto',
    'fila_origen',
    'participantes_elegibles',
    'hash_padron',
    'version_algoritmo'
  ]

  const rows = records.map((record) => [
    record.drawNumber,
    record.drawnAt,
    record.prize,
    record.winner?.name,
    record.winner?.id,
    record.winner?.ticket,
    record.winner?.rowNumber,
    record.participantCount,
    record.rosterHash,
    record.version
  ].map(csvCell).join(','))

  return `\uFEFF${headers.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`
}
