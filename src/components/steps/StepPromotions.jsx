import React from 'react'

export default function StepPromotions({ data, update }){
  return (
    <section>
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

      <label>
        ¿Qué tipo de información te gustaría recibir? (marca las que apliquen)
        <input type="text" placeholder="Escribe las opciones separadas por comas" value={Array.isArray(data.tipoInformacion)?data.tipoInformacion.join(', '):data.tipoInformacion||''} onChange={e=>update({ tipoInformacion: e.target.value })} />
      </label>

      <label>
        Comentario adicional (opcional)
        <textarea value={data.comentario||''} onChange={e=>update({ comentario: e.target.value })} rows={4} />
      </label>
    </section>
  )
}
