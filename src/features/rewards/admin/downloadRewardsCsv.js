import { createMexicoDatedCsvFilename, downloadProtectedCsv } from '../../registros/admin/downloadProtectedCsv'

function resolveEndpoint() {
  const configured = import.meta.env.VITE_REWARDS_EXPORT_ENDPOINT?.trim()
  if (configured) return configured
  const submission = import.meta.env.VITE_REWARDS_SUBMISSION_ENDPOINT?.trim()
  if (submission && /\/api\/rewards-submit\/?$/.test(submission)) {
    return submission.replace(/\/api\/rewards-submit\/?$/, '/api/rewards-submissions.csv')
  }
  return import.meta.env.DEV ? 'http://localhost:3001/api/rewards-submissions.csv' : ''
}

export function downloadRewardsCsv({ token, endpoint = resolveEndpoint(), now = new Date(), ...dependencies }) {
  return downloadProtectedCsv({
    token,
    endpoint,
    filename: createMexicoDatedCsvFilename('club-charros-experiencias-recompensas', now),
    configurationMessage: 'La descarga de experiencias y recompensas no está configurada.',
    expectedColumns: ['nombreCompleto', 'recomendacion', 'aceptaAvisoPrivacidad'],
    schemaMessage: 'El archivo recibido no corresponde a experiencias y recompensas.',
    ...dependencies
  })
}
