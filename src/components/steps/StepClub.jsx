import React from 'react'

export default function StepClub({ data, update }) {
  return (
    <section>
      <h3>Club Charros (Abonados)</h3>
      <p>¿Te interesa recibir información sobre Club Charros / Abonos?</p>
      <label>
        <input type="radio" name="club" defaultChecked={data.clubInterest==='yes'} onChange={e=>update({ clubInterest: 'yes' })} /> Sí
      </label>
      <label>
        <input type="radio" name="club" defaultChecked={data.clubInterest==='no'} onChange={e=>update({ clubInterest: 'no' })} /> No
      </label>

      <label>
        ¿Qué beneficios te interesan? (elige lo que prefieras)
        <input type="text" defaultValue={data.clubBenefits||''} onChange={e=>update({ clubBenefits: e.target.value })} />
      </label>
    </section>
  )
}
