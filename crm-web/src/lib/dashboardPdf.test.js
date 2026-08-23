import { describe, expect, it, vi } from 'vitest'
import {
  buildDashboardPdfFilename,
  createExecutiveDashboardPdf,
  downloadExecutiveDashboardPdf,
} from './dashboardPdf'

function minimalJpeg() {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ])
}

const report = {
  summary: {
    totalContacts: 2200,
    currentSubscribers: 950,
    activeSeats: 1430,
    renewing: 610,
    newSubscribers: 85,
    notContacted: 320,
    overdueFollowUps: 42,
    salesAmount: 1280000,
    membershipNetAmount: 168732,
    humanInteractions: 510,
    campaignMessages: 820,
    unassigned: 19,
  },
  operation: { scheduled: 38, pending: 17, completed: 16, overdue: 5 },
  filters: { season: 'LMP-2026-27', period: 'month', executiveId: '', executiveName: 'Todos los ejecutivos' },
}

describe('reporte ejecutivo PDF', () => {
  it('genera un PDF local con un nombre saneado y predecible', () => {
    const generatedAt = new Date(2026, 7, 21, 14, 35)
    const blob = createExecutiveDashboardPdf({ ...report, generatedAt, logoBytes: minimalJpeg() })

    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(1_000)
    expect(buildDashboardPdfFilename({ ...report.filters, generatedAt }))
      .toBe('reporte-direccion-lmp-2026-27-mensual-2026-08-21.pdf')
  })

  it('descarga el archivo sin enviarlo a ningún endpoint', async () => {
    const link = { click: vi.fn(), remove: vi.fn(), hidden: false, href: '', download: '', rel: '' }
    const documentRef = {
      createElement: vi.fn(() => link),
      body: { appendChild: vi.fn() },
    }
    const urlApi = { createObjectURL: vi.fn(() => 'blob:dashboard'), revokeObjectURL: vi.fn() }
    const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => minimalJpeg().buffer }))
    const generatedAt = new Date(2026, 7, 21, 14, 35)

    const result = await downloadExecutiveDashboardPdf(report, {
      documentRef,
      urlApi,
      fetchImpl,
      generatedAt,
      logoUrl: '/charros-logo.jpeg',
    })

    expect(fetchImpl).toHaveBeenCalledWith('/charros-logo.jpeg', { cache: 'force-cache', credentials: 'same-origin' })
    expect(documentRef.body.appendChild).toHaveBeenCalledWith(link)
    expect(link.download).toBe('reporte-direccion-lmp-2026-27-mensual-2026-08-21.pdf')
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.remove).toHaveBeenCalledOnce()
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:dashboard')
    expect(result.blob.type).toBe('application/pdf')
  })
})
