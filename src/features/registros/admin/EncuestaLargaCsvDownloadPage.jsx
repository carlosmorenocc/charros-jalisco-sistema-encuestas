import React from 'react'
import AdminCsvDownloadPage from './AdminCsvDownloadPage'
import { downloadEncuestaLargaCsv } from './downloadEncuestaLargaCsv'

export default function EncuestaLargaCsvDownloadPage() {
  return (
    <AdminCsvDownloadPage
      documentTitle="Exportación de la Encuesta Larga | Charros de Jalisco"
      heading="Encuesta larga"
      intro="Descarga las respuestas del formulario completo de experiencia del aficionado."
      buttonText="Descargar encuesta larga CSV"
      idPrefix="encuesta-larga"
      downloadCsv={downloadEncuestaLargaCsv}
    />
  )
}
