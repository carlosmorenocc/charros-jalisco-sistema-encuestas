import React from 'react'

export default function StepClubCharros({ data, update }){
  const relation = data.relacionCharros || ''

  return (
    <section>
      <h3>Club Charros</h3>
      <p style={{fontSize:14}}>Estamos desarrollando nuevas formas de vivir Charros como miembro de la familia del club. Tu opinión nos ayuda a mejorar beneficios, atención, comunicación y experiencias para nuestros aficionados más frecuentes.</p>

      <label>
        ¿Te interesaría recibir información sobre Club Charros y sus membresías?
        <select value={data.interesClubCharros||''} onChange={e=>update({ interesClubCharros: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
          <option value="talvez">Tal vez más adelante</option>
        </select>
      </label>

      {relation === 'miembro' && (
        <label>
          Si actualmente eres miembro, ¿qué influyó para adquirir tu membresía? (máx 3)
          <input type="text" placeholder="Escribe hasta 3 razones separadas por comas" value={data.razonAbonadoText||''} onChange={e=>update({ razonAbonadoText: e.target.value })} />
        </label>
      )}

      {relation === 'fui-abonado' && (
        <label>
          Si fuiste abonado y sigues viniendo, ¿por qué dejaste de renovar?
          <input type="text" placeholder="Razón principal" value={data.razonNoRenovo||''} onChange={e=>update({ razonNoRenovo: e.target.value })} />
        </label>
      )}

      {relation !== 'miembro' && (
        <label>
          Si no eres abonado actualmente, ¿qué te ha detenido para comprar una membresía?
          <input type="text" placeholder="Razones principales" value={data.barreraCompraText||''} onChange={e=>update({ barreraCompraText: e.target.value })} />
        </label>
      )}

      <label>
        ¿Qué beneficio te llamaría más la atención en Club Charros? (máx 3)
        <input type="text" placeholder="Ej: Descuentos en tienda, Acceso preferencial" value={data.beneficioPreferidoText||''} onChange={e=>update({ beneficioPreferidoText: e.target.value })} />
      </label>

      <label>
        En una escala del 1 al 10, ¿qué tan probable es que consideres comprar o renovar una membresía?
        <input type="number" min="1" max="10" value={data.probabilidadCompra||''} onChange={e=>update({ probabilidadCompra: e.target.value })} />
      </label>
    </section>
  )
}
