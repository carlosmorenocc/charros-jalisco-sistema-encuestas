import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT || 3001)
const dataDir = path.join(__dirname, 'data')
const csvPath = path.join(dataDir, 'submissions.csv')

const CSV_COLUMNS = [
  'timestamp',
  'campaignName',
  'source',
  'nombre',
  'apellido',
  'email',
  'telefono',
  'rangoEdad',
  'sexo',
  'municipio',
  'relacionCharros',
  'antiguedad',
  'acompanantes',
  'motivacion',
  'calificacionExperiencia',
  'aspectosDisfrutados',
  'aspectosMejorar',
  'consumoEstadio',
  'interesClubCharros',
  'razonAbonado',
  'razonNoRenovo',
  'barreraCompra',
  'beneficioPreferido',
  'probabilidadCompra',
  'canalPromociones',
  'tipoInformacion',
  'comentario',
  'aceptaAvisoPrivacidad',
  'aceptaComunicaciones'
]

function ensureDataFile() {
  fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(csvPath)) {
    const header = CSV_COLUMNS.join(',') + '\n'
    fs.writeFileSync(csvPath, header, 'utf8')
  }
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

app.use(cors({ origin: true }))
app.use(express.json({ limit: '5mb' }))

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, status: 'ready' })
})

app.post('/api/submit', (req, res) => {
  try {
    ensureDataFile()
    const payload = req.body || {}
    fs.appendFileSync(csvPath, buildCsvRow(payload), 'utf8')
    res.json({ ok: true, stored: true, rows: 1 })
  } catch (error) {
    console.error('CSV persistence error', error)
    res.status(500).json({ ok: false, error: 'Unable to persist submission' })
  }
})

app.listen(port, () => {
  console.log(`Submission API listening on http://localhost:${port}`)
})
