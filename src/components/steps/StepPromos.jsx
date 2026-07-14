import React from 'react'

export default function StepPromos({ data, update }) {
  return (
    <section>
      <h3>Promociones y comunicación</h3>
      <label>
        ¿Qué canales prefieres para recibir novedades?
        <select defaultValue={data.preferredChannel||'email'} onChange={e=>update({ preferredChannel: e.target.value })}>
          <option value="email">Correo electrónico</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
        </select>
      </label>

      <label>
        ¿Te interesan promociones exclusivas de la tienda?
        <select defaultValue={data.promoInterest||'yes'} onChange={e=>update({ promoInterest: e.target.value })}>
          <option value="yes">Sí</option>
          <option value="no">No</option>
        </select>
      </label>
    </section>
  )
}
