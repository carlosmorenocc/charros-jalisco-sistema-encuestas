import React from 'react'

const infoOptions = [
  'Fechas y horarios de partidos',
  'Promociones y descuentos',
  'Beneficios del Club Charros',
  'Noticias del equipo',
  'Activaciones y eventos especiales',
  'Experiencias para familias',
  'Venta de boletos',
  'Otro'
]

const toggleOption = (updateKey, data, update) => (e) => {
  const value = e.target.value
  let list = Array.isArray(data[updateKey]) ? [...data[updateKey]] : []

  if (e.target.checked) {
    list.push(value)
  } else {
    list = list.filter((item) => item !== value)
  }

  update({ [updateKey]: list })
}

export default function StepPromotions({ data, update }){
  const selectedInfo = Array.isArray(data.tipoInformacion) ? data.tipoInformacion : []

  return (
    <section className="promotions-step">
      <h3>Promociones y comunicación</h3>

      <label>
        ¿Cómo te enteras normalmente de los partidos y promociones de Charros?
        <select value={data.canalPromocionesMain||''} onChange={e=>update({ canalPromocionesMain: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Correo electrónico</option>
          <option value="web">Página web</option>
          <option value="amigos">Amigos / familia</option>
          <option value="pantallas">Pantallas del estadio</option>
          <option value="otro">Otro</option>
        </select>
      </label>

      <fieldset>
        <legend>¿Qué tipo de información te gustaría recibir? (marca las que apliquen)</legend>
        {infoOptions.map((option) => (
          <label key={option} className="checkbox">
            <input
              type="checkbox"
              value={option}
              checked={selectedInfo.includes(option)}
              onChange={toggleOption('tipoInformacion', data, update)}
            />
            {option}
          </label>
        ))}
      </fieldset>

      {selectedInfo.includes('Otro') && (
        <label>
          Especifica otro tipo de información
          <input
            type="text"
            value={data.tipoInformacionOtro || ''}
            onChange={e=>update({ tipoInformacionOtro: e.target.value })}
            placeholder="Escribe tu opción"
          />
        </label>
      )}

      <label>
        Comentario adicional (opcional)
        <textarea value={data.comentario||''} onChange={e=>update({ comentario: e.target.value })} rows={4} />
      </label>
    </section>
  )
}
