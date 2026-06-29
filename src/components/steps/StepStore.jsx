import React from 'react'

export default function StepStore({ data, update }) {
  return (
    <section>
      <h3>Tienda Oficial</h3>
      <label>
        ¿Has comprado en la tienda oficial?
        <select defaultValue={data.storeBought||'no'} onChange={e=>update({ storeBought: e.target.value })}>
          <option value="no">No</option>
          <option value="yes">Sí</option>
        </select>
      </label>

      <label>
        ¿Qué productos te interesan?
        <input type="text" defaultValue={data.storeInterests||''} onChange={e=>update({ storeInterests: e.target.value })} />
      </label>
    </section>
  )
}
