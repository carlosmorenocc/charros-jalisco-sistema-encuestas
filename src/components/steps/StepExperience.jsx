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

export default function StepExperience({ data, update, errors = {} }) {
  const opciones = ['Ambiente','Juego','Comida y bebida','Música / entretenimiento','Convivencia familiar','Atención del personal','Instalaciones','Otro']

  return (
    <section className="experience-step">
      <h3>Experiencia en el estadio</h3>

      <label>
        Del 1 al 10, ¿cómo calificarías tu experiencia en Charros?
        <select value={data.calificacionExperiencia||''} onChange={e=>update({ calificacionExperiencia: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
          <option value="7">7</option>
          <option value="8">8</option>
          <option value="9">9</option>
          <option value="10">10</option>
        </select>
      </label>

      <label>
        ¿Qué te gustaría incluir o modificar en tu experiencia?
        <textarea
          value={data.comentarioExperiencia||''}
          onChange={e=>update({ comentarioExperiencia: e.target.value })}
          rows={4}
          placeholder="Cuéntanos qué mejorarías o qué te gustaría ver en tu próxima visita."
        />
      </label>

      <fieldset>
        <legend>Cuando vas a Charros, ¿qué es lo que más disfrutas? (máx 4)</legend>
        {opciones.map(o=> (
          <label key={o} className="checkbox">
            <input type="checkbox" value={o} checked={(data.aspectosDisfrutados||[]).includes(o)} onChange={maxChoices(opciones,4,'aspectosDisfrutados',data,update)} /> {o}
          </label>
        ))}
      </fieldset>

      {(data.aspectosDisfrutados || []).includes('Otro') && (
        <label>
          ¿Cuál es ese otro aspecto que más disfrutas?
          <input
            type="text"
            value={data.aspectosDisfrutadosOtro || ''}
            onChange={e=>update({ aspectosDisfrutadosOtro: e.target.value })}
            placeholder="Escribe aquí tu respuesta"
          />
        </label>
      )}

      <label>
        Cuando usas MyCashless, ¿qué tan fácil te resulta pagar dentro del estadio?
        <select value={data.facilidadMyCashless||''} onChange={e=>update({ facilidadMyCashless: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="muy-facil">Muy fácil</option>
          <option value="facil">Fácil</option>
          <option value="regular">Regular</option>
          <option value="dificil">Difícil</option>
          <option value="muy-dificil">Muy difícil</option>
          <option value="no-lo-he-usado">No lo he usado</option>
        </select>
      </label>

      <label>
        ¿Qué opinas sobre la atención e información que comparten los encargados en módulos MyCashless?
        <textarea
          value={data.comentarioMyCashless||''}
          onChange={e=>update({ comentarioMyCashless: e.target.value })}
          rows={3}
          placeholder="Comparte tu opinión sobre la atención recibida y la claridad de la información en módulos MyCashless."
          aria-invalid={Boolean(errors.comentarioMyCashless)}
        />
        {errors.comentarioMyCashless && <div className="error-message">{errors.comentarioMyCashless}</div>}
      </label>
    </section>
  )
}
