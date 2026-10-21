import React from 'react'
import AdminCsvDownloadPage from '../../registros/admin/AdminCsvDownloadPage'
import { downloadRewardsCsv } from './downloadRewardsCsv'

export default function RewardsCsvDownloadPage() {
  return (
    <AdminCsvDownloadPage
      documentTitle="Experiencias y Recompensas | Charros de Jalisco"
      heading="Participaciones y recomendaciones"
      intro="Descarga la base de respuestas del registro para experiencias, eventos y recompensas."
      buttonText="Descargar participaciones CSV"
      idPrefix="experiencias-recompensas"
      downloadCsv={downloadRewardsCsv}
    />
  )
}
