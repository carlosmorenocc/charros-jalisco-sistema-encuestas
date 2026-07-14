import React from 'react'

export default function StepProfile({ data, update }) {
  return (
    <section>
      <h3>Perfil del aficionado</h3>
      <label>
        ¿Eres abonado?
        <select defaultValue={data.isSubscriber||'no'} onChange={e=>update({ isSubscriber: e.target.value })}>
          <option value="no">No</option>
          <option value="yes">Sí</option>
        </select>
      </label>

      <label>
        Edad
        <input type="number" min="12" max="120" defaultValue={data.age||''} onChange={e=>update({ age: e.target.value })} />
      </label>

      <label>
        ¿Con quién asistes normalmente?
        <input type="text" defaultValue={data.companions||''} onChange={e=>update({ companions: e.target.value })} />
      </label>
    </section>
  )
}
