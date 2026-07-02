import React from 'react'

export default function LeadStepPrivacy({ data, update, errors = {} }) {
  return (
    <section>
      <h3>Términos y condiciones</h3>
      <p>
        Al registrar tus datos aceptas el Aviso de Privacidad de Charros de Jalisco y autorizas el uso de
        tu información para contacto, comunicación de promociones y actividades relacionadas al club.
      </p>
      <p>
        Consulta el aviso completo en{' '}
        <a href="https://www.charrosjalisco.com/aviso-de-privacidad" target="_blank" rel="noreferrer">
          https://www.charrosjalisco.com/aviso-de-privacidad
        </a>
      </p>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!data.aceptaAvisoPrivacidad}
          onChange={(e) => update({ aceptaAvisoPrivacidad: e.target.checked })}
        />
        Acepto el Aviso de Privacidad de Charros de Jalisco. *
      </label>
      {errors.aceptaAvisoPrivacidad && <div className="error-message">{errors.aceptaAvisoPrivacidad}</div>}

      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!data.aceptaComunicaciones}
          onChange={(e) => update({ aceptaComunicaciones: e.target.checked })}
        />
        Acepto recibir información de promociones, preventas y eventos.
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!data.aceptaRegistroDiario}
          onChange={(e) => update({ aceptaRegistroDiario: e.target.checked })}
        />
        Confirmo que este correo solo registrará un lead por día. *
      </label>
      {errors.aceptaRegistroDiario && <div className="error-message">{errors.aceptaRegistroDiario}</div>}
    </section>
  )
}
