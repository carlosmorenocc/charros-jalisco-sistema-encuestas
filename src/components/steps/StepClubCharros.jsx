import React from 'react'

const maxChoices = (limit, updateKey, data, update) => (e) => {
  const val = e.target.value
  let list = Array.isArray(data[updateKey]) ? [...data[updateKey]] : []

  if (e.target.checked) {
    if (list.length < limit) list.push(val)
    else e.target.checked = false
  } else {
    list = list.filter((x) => x !== val)
  }

  update({ [updateKey]: list })
}

export default function StepClubCharros({ data, update }){
  const abonadoStatus = data.abonadoClubStatus || ''
  const beneficios = [
    'Descuentos en boletos',
    'Descuentos en alimentos y bebidas',
    'Descuentos en tienda oficial',
    'Acceso preferencial al estadio',
    'Eventos exclusivos con el equipo',
    'Contenido exclusivo y preventas',
    'Mejores ubicaciones',
    'Otro'
  ]

  return (
    <section className="club-step">
      <h3>
        Club Charros
        <small className="club-step-note">Abonados*</small>
      </h3>
      <p style={{fontSize:14}}>Estamos desarrollando nuevas formas de vivir Charros como miembro de la familia del club. Tu opinión nos ayuda a mejorar beneficios, atención, comunicación y experiencias para nuestros aficionados más frecuentes.</p>

      <label>
        ¿Te interesaría recibir información sobre Club Charros y sus membresías? Una nueva experiencia en el Estadio.
        <select value={data.interesClubCharros||''} onChange={e=>update({ interesClubCharros: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
          <option value="talvez">Tal vez más adelante</option>
        </select>
      </label>

      <label>
        ¿Eres abonado de los Charros?
        <select value={abonadoStatus} onChange={e=>update({ abonadoClubStatus: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="abonado-actual">Sí, soy Abonado Charro</option>
          <option value="fui-abonado">Lo fui, pero en este momento no lo soy</option>
          <option value="desconoce-beneficios">No conozco qué beneficios incluye</option>
        </select>
      </label>

      {abonadoStatus === 'fui-abonado' && (
        <label>
          Para el Club Charros es de vital importancia la atención y experiencia que vivas con nosotros, tu hogar. Te invitamos a compartir cómo fue tu experiencia como Abonado.
          <textarea
            value={data.razonNoRenovo||''}
            onChange={e=>update({ razonNoRenovo: e.target.value })}
            rows={4}
            placeholder="Compártenos tu experiencia como Abonado para ayudarnos a mejorar"
          />
        </label>
      )}

      <fieldset>
        <legend>¿Qué beneficio te llamaría más la atención en Club Charros? (máx 4)</legend>
        {beneficios.map((beneficio) => (
          <label key={beneficio} className="checkbox">
            <input
              type="checkbox"
              value={beneficio}
              checked={(data.beneficioPreferido || []).includes(beneficio)}
              onChange={maxChoices(4, 'beneficioPreferido', data, update)}
            />
            {beneficio}
          </label>
        ))}
      </fieldset>
    </section>
  )
}
