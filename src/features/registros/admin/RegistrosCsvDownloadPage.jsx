import React from 'react'
import AdminCsvDownloadPage from './AdminCsvDownloadPage'
import { downloadRegistrosCsv } from './downloadRegistrosCsv'

export default function RegistrosCsvDownloadPage() {
  return (
    <AdminCsvDownloadPage
      documentTitle="Exportación del Registro Oficial Corto | Charros de Jalisco"
      heading="Registro Oficial — registro corto"
      intro="Descarga la base capturada mediante el registro corto de estadio."
      buttonText="Descargar registro corto CSV"
      idPrefix="registros-cortos"
      downloadCsv={downloadRegistrosCsv}
    />
  )
}
