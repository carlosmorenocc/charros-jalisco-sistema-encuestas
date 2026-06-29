import React from 'react'

const maxChoices = (arr, limit, updateKey, data, update) => (e) => {
  const val = e.target.value
  let list = Array.isArray(data[updateKey]) ? [...data[updateKey]] : []
  if (e.target.checked) {
    if (list.length < limit) list.push(val)
    else e.target.checked = false
  } else {
    list = list.filter(x=>x!==val)
  }
  update({ [updateKey]: list })
}

export default function StepExperience({ data, update }) {
  const opciones = ['Ambiente','Juego','Comida y bebida','Música / entretenimiento','Convivencia familiar','Atención del personal','Instalaciones','Otro']
  const mejoras = ['Alimentos y bebidas','Filas / tiempos de espera','Baños','Estacionamiento','Limpieza','Pantallas / audio','Tienda oficial','Señalización','Nada, todo estuvo excelente','Otro']

  return (
    <section>
      <h3>Experiencia en el estadio</h3>

      <label>
        En general, ¿cómo calificarías tu experiencia hoy?
        <select value={data.calificacionExperiencia||''} onChange={e=>update({ calificacionExperiencia: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
      </label>

      <fieldset>
        <legend>¿Qué fue lo que más disfrutaste? (máx 3)</legend>
        {opciones.map(o=> (
          <label key={o} className="checkbox">
            <input type="checkbox" value={o} checked={(data.aspectosDisfrutados||[]).includes(o)} onChange={maxChoices(opciones,3,'aspectosDisfrutados',data,update)} /> {o}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>¿Qué aspectos mejorarías? (máx 3)</legend>
        {mejoras.map(m=> (
          <label key={m} className="checkbox">
            <input type="checkbox" value={m} checked={(data.aspectosMejorar||[]).includes(m)} onChange={maxChoices(mejoras,3,'aspectosMejorar',data,update)} /> {m}
          </label>
        ))}
      </fieldset>

      <label>
        ¿Cómo realizas normalmente tus consumos dentro del estadio?
        <select value={data.consumoEstadio||''} onChange={e=>update({ consumoEstadio: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="mycashless">MyCashless</option>
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta bancaria</option>
          <option value="no-consumo">No consumo dentro del estadio</option>
          <option value="otro">Otro</option>
        </select>
      </label>

      <label>
        Comentarios / sugerencias (opcional)
        <textarea value={data.comentarioExperiencia||''} onChange={e=>update({ comentarioExperiencia: e.target.value })} rows={3} />
      </label>
    </section>
  )
}
