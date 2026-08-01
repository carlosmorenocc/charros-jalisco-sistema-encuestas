import React from 'react'

const PRIVACY_NOTICE_URL = 'https://www.charrosjalisco.com/aviso-de-privacidad'

export default function AbonadosPrivacyStep({ data, update, errors = {} }) {
  return (
    <section aria-labelledby="abonados-privacy-title">
      <h3 id="abonados-privacy-title">Aviso de privacidad</h3>
      <p>
        Los datos personales recabados serán utilizados por Charros de Jalisco para gestionar tu
        registro de talla de jersey como abonado LMP 2026-2027, validar la información capturada,
        dar seguimiento a esta campaña y realizar análisis operativo relacionado con ella.
      </p>
      <p>
        Consulta el aviso completo en{' '}
        <a href={PRIVACY_NOTICE_URL} target="_blank" rel="noreferrer">
          {PRIVACY_NOTICE_URL}
        </a>
      </p>

      <label className="checkbox" htmlFor="abonado-acepta-privacidad">
        <input
          id="abonado-acepta-privacidad"
          name="aceptaAvisoPrivacidad"
          type="checkbox"
          checked={Boolean(data.aceptaAvisoPrivacidad)}
          onChange={(event) => update({ aceptaAvisoPrivacidad: event.target.checked })}
          aria-invalid={Boolean(errors.aceptaAvisoPrivacidad)}
          aria-describedby={errors.aceptaAvisoPrivacidad ? 'abonado-privacidad-error' : undefined}
        />
        He leído y acepto el Aviso de Privacidad de Charros de Jalisco y autorizo el tratamiento
        de mis datos para las finalidades descritas. *
      </label>
      {errors.aceptaAvisoPrivacidad && (
        <div id="abonado-privacidad-error" className="error-message">
          {errors.aceptaAvisoPrivacidad}
        </div>
      )}

      <label className="checkbox" htmlFor="abonado-acepta-comunicaciones">
        <input
          id="abonado-acepta-comunicaciones"
          name="aceptaComunicaciones"
          type="checkbox"
          checked={Boolean(data.aceptaComunicaciones)}
          onChange={(event) => update({ aceptaComunicaciones: event.target.checked })}
        />
        Acepto recibir información sobre promociones, preventas, eventos y novedades de Charros
        de Jalisco. (Opcional)
      </label>
    </section>
  )
}
