import {
  createDrawRecord,
  exportWinnerHistoryCsv,
  hashRoster
} from './audit'

describe('audit helpers', () => {
  it('genera una huella SHA-256 estable para el padrón', async () => {
    const participants = [
      { id: 'P-1', name: 'Ana', ticket: 'B-1', rowNumber: 2 }
    ]

    const first = await hashRoster(participants)
    const second = await hashRoster(participants)

    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })

  it('crea un registro sin datos de contacto', () => {
    const record = createDrawRecord({
      winner: { id: 'P-1', name: 'Ana', ticket: 'B-1', rowNumber: 2 },
      rosterHash: 'abc',
      participantCount: 500,
      prize: 'Jersey oficial',
      drawNumber: 1,
      drawnAt: '2026-07-23T18:00:00.000Z'
    })

    expect(record.winner.name).toBe('Ana')
    expect(record).not.toHaveProperty('email')
    expect(record).not.toHaveProperty('telefono')
  })

  it('neutraliza fórmulas al exportar CSV', () => {
    const csv = exportWinnerHistoryCsv([
      createDrawRecord({
        winner: { id: '=CMD()', name: '+Nombre', ticket: '@Boleto', rowNumber: 2 },
        rosterHash: 'abc',
        participantCount: 500,
        prize: '-Premio',
        drawNumber: 1,
        drawnAt: '2026-07-23T18:00:00.000Z'
      })
    ])

    expect(csv).toContain(`"'+Nombre"`)
    expect(csv).toContain(`"'=CMD()"`)
    expect(csv).toContain(`"'@Boleto"`)
  })
})
