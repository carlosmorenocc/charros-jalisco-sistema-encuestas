import React from 'react'

export default function PrivacyConsent({ data, update }){
  return (
    <section>
      <h3>Aviso de privacidad</h3>
      <p>Los datos personales recabados mediante esta encuesta serán utilizados por Charros de Jalisco para fines de contacto, comunicación, análisis estadístico, mejora de la experiencia del aficionado y envío de información relacionada con promociones, eventos, preventas y actividades del Club.</p>
      <p>Consulta el aviso completo en <a href="https://www.charrosjalisco.com/aviso-de-privacidad" target="_blank">https://www.charrosjalisco.com/aviso-de-privacidad</a></p>

      <label className="checkbox">
        <input type="checkbox" checked={!!data.aceptaAvisoPrivacidad} onChange={e=>update({ aceptaAvisoPrivacidad: e.target.checked })} />
        He leído y acepto el Aviso de Privacidad de Charros de Jalisco y autorizo el tratamiento de mis datos personales conforme a lo establecido en dicho documento.
      </label>

      <label className="checkbox">
        <input type="checkbox" checked={!!data.aceptaComunicaciones} onChange={e=>update({ aceptaComunicaciones: e.target.checked })} />
        Acepto recibir por correo electrónico información sobre próximas series, promociones, preventas, eventos y novedades de Charros de Jalisco.
      </label>
    </section>
  )
}
