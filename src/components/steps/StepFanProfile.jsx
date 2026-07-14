import React from 'react'

export default function StepFanProfile({ data, update }){
  return (
    <section className="profile-step">
      <h3>Perfil del aficionado</h3>

      <label>
        ¿Cuál opción describe mejor tu relación con Charros?
        <select value={data.relacionCharros||''} onChange={e=>update({ relacionCharros: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="miembro">Soy miembro / abonado Club Charros</option>
          <option value="fui-abonado">Fui abonado y sigo viniendo al estadio</option>
          <option value="serie">Vengo al menos una vez por serie</option>
          <option value="ocasional">Vengo ocasionalmente</option>
          <option value="primera">Es mi primera visita</option>
        </select>
      </label>

      <label>
        ¿Desde cuándo asistes a los juegos de Charros?
        <select value={data.antiguedad||''} onChange={e=>update({ antiguedad: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="primera">Es mi primera vez</option>
          <option value="<1">Menos de 1 año</option>
          <option value="1-3">Entre 1 y 3 años</option>
          <option value="4-7">Entre 4 y 7 años</option>
          <option value=">7">Más de 7 años</option>
          <option value="desde-inicios">He seguido al equipo desde sus inicios</option>
        </select>
      </label>

      <label>
        ¿Con quién sueles venir al estadio?
        <select value={data.acompanantes||''} onChange={e=>update({ acompanantes: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="solo">Solo/a</option>
          <option value="pareja">Pareja</option>
          <option value="familia">Familia</option>
          <option value="amigos">Amigos</option>
          <option value="trabajo">Compañeros de trabajo</option>
          <option value="otro">Otro</option>
        </select>
      </label>

      <label>
        ¿Cuál es la principal razón por la que vienes al estadio?
        <select value={data.motivacion||''} onChange={e=>update({ motivacion: e.target.value })}>
          <option value="">-- Selecciona --</option>
          <option value="beisbol">Soy fanático del béisbol</option>
          <option value="charros">Soy fan de Charros</option>
          <option value="convivir">Vengo por convivir con familia</option>
          <option value="amigos">Vengo con amigos</option>
          <option value="ambiente">Me gusta el ambiente</option>
          <option value="invitado">Me invitaron</option>
          <option value="otro">Otro</option>
        </select>
      </label>
    </section>
  )
}
