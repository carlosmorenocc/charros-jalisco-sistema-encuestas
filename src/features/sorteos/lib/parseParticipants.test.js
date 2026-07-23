import {
  CsvValidationError,
  MAX_PARTICIPANTS,
  parseParticipantCsv
} from './parseParticipants'

describe('parseParticipantCsv', () => {
  it('importa CSV con BOM, CRLF y comas entre comillas', () => {
    const result = parseParticipantCsv(
      '\uFEFFid_participante,nombre,id_boleto,correo\r\nP-01,"José, Ramírez",B-01,jose@example.com\r\nP-02,Ana Pérez,B-02,ana@example.com\r\n'
    )

    expect(result.participants).toEqual([
      { id: 'P-01', name: 'José, Ramírez', ticket: 'B-01', email: 'jose@example.com', rowNumber: 2 },
      { id: 'P-02', name: 'Ana Pérez', ticket: 'B-02', email: 'ana@example.com', rowNumber: 3 }
    ])
    expect(result.stats.validParticipants).toBe(2)
  })

  it('reconoce aliases de correo y conserva el dato para mostrar al ganador', () => {
    const result = parseParticipantCsv(
      'id,nombre,correo_electronico\n001,María López,maria@example.com\n'
    )

    expect(result.participants[0].email).toBe('maria@example.com')
    expect(result.stats.missingEmailRows).toBe(0)
  })

  it('mantiene compatibles las bases sin correo y genera una advertencia', () => {
    const result = parseParticipantCsv(
      'id,nombre\n001,María López\n'
    )

    expect(result.participants[0].email).toBe('')
    expect(result.warnings.join(' ')).toContain('Correo no disponible')
  })

  it('detecta CSV separado por punto y coma', () => {
    const result = parseParticipantCsv(
      'folio;participante\n001;María López\n002;Carlos Díaz\n'
    )

    expect(result.delimiter).toBe(';')
    expect(result.participants.map(({ id }) => id)).toEqual(['001', '002'])
  })

  it('consolida duplicados por id y conserva una oportunidad por persona', () => {
    const result = parseParticipantCsv(
      'id_participante,nombre,id_boleto\nP-01,Ana Pérez,B-01\nP-01,Ana Pérez,B-02\n'
    )

    expect(result.participants).toHaveLength(1)
    expect(result.stats.duplicateRows).toBe(1)
    expect(result.warnings.join(' ')).toContain('oportunidad por persona')
  })

  it('consolida nombres repetidos cuando no existe id', () => {
    const result = parseParticipantCsv(
      'nombre\nAna Pérez\n ana   pérez \nLuis Gómez\n'
    )

    expect(result.participants).toHaveLength(2)
    expect(result.stats.duplicateRows).toBe(1)
    expect(result.warnings[0]).toContain('identificador')
  })

  it('rechaza archivos sin una columna reconocible de nombres', () => {
    expect(() => parseParticipantCsv('correo,telefono\na@b.com,123\n'))
      .toThrow(CsvValidationError)
  })

  it('rechaza más del máximo de participantes únicos', () => {
    const rows = ['id,nombre']
    for (let index = 0; index <= MAX_PARTICIPANTS; index += 1) {
      rows.push(`${index},Participante ${index}`)
    }

    expect(() => parseParticipantCsv(rows.join('\n'))).toThrow(
      `máximo de ${MAX_PARTICIPANTS.toLocaleString('es-MX')}`
    )
  })
})
