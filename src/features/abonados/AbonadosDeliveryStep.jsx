import React from 'react'
import boletoMovilGuide from '../../assets/boleto-movil-id-guide.png'

function ErrorMessage({ id, message }) {
  if (!message) return null
  return <div id={id} className="error-message">{message}</div>
}

export default function AbonadosDeliveryStep({ data, update, errors = {} }) {
  const linked = data.boletoMovilLigado
  return (
    <section aria-labelledby="abonados-delivery-title">
      <h3 id="abonados-delivery-title">Entrega de tus abonos</h3>
      <fieldset className="choice-fieldset">
        <legend>¿Tienes ya tu abono ligado a BoletoMóvil? *</legend>
        <div className="choice-cards">
          {['SI', 'NO'].map((value) => (
            <label key={value} className="choice-card">
              <input type="radio" name="boletoMovilLigado" value={value} checked={linked === value}
                onChange={() => update({ boletoMovilLigado: value, ...(value === 'SI' ? { boletoMovilId: '', preferenciaEntrega: '' } : {}) })} />
              <span>{value === 'SI' ? 'Sí' : 'No'}</span>
            </label>
          ))}
        </div>
        <ErrorMessage id="boleto-ligado-error" message={errors.boletoMovilLigado} />
      </fieldset>

      {linked === 'NO' && (
        <>
          <div className="form-field boleto-id-field">
            <div className="form-label-with-help">
              <label htmlFor="boleto-movil-id">Ingresa tu ID de BoletoMóvil aquí *</label>
              <button type="button" className="info-help" aria-label="Cómo encontrar mi ID de BoletoMóvil">
                i
                <span className="boleto-tooltip" role="tooltip">
                  <strong>¿Dónde encuentro mi ID?</strong>
                  <ol>
                    <li>Ingresa a BoletoMóvil desde el navegador de tu celular.</li>
                    <li>Dirígete a tu perfil.</li>
                    <li>Ahí encontrarás el ID debajo de tus datos.</li>
                  </ol>
                  <img src={boletoMovilGuide} alt="Ejemplo anónimo de la ubicación del ID en el perfil de BoletoMóvil" />
                </span>
              </button>
            </div>
            <input id="boleto-movil-id" type="text" inputMode="numeric" maxLength={20} value={data.boletoMovilId || ''}
              placeholder="Ej. 123456" onChange={(event) => update({ boletoMovilId: event.target.value.replace(/\D/g, '').slice(0, 20) })}
              required aria-invalid={Boolean(errors.boletoMovilId)} />
            <ErrorMessage id="boleto-id-error" message={errors.boletoMovilId} />
          </div>
          <fieldset className="choice-fieldset">
            <legend>¿Cómo prefieres recibir tus boletos durante la temporada 2026-2027? *</legend>
            <div className="choice-cards choice-cards--wide">
              <label className="choice-card"><input type="radio" name="preferenciaEntrega" value="APP_BOLETOMOVIL"
                checked={data.preferenciaEntrega === 'APP_BOLETOMOVIL'} onChange={(event) => update({ preferenciaEntrega: event.target.value })} />
                <span>Aplicación BoletoMóvil</span></label>
              <label className="choice-card"><input type="radio" name="preferenciaEntrega" value="PDF"
                checked={data.preferenciaEntrega === 'PDF'} onChange={(event) => update({ preferenciaEntrega: event.target.value })} />
                <span>Archivo PDF</span></label>
            </div>
            <ErrorMessage id="preferencia-entrega-error" message={errors.preferenciaEntrega} />
          </fieldset>
        </>
      )}
    </section>
  )
}
