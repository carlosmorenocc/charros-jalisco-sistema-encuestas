import React from 'react'

export default function LeadStepContact({ data, update, errors = {} }) {
  return (
    <section>
      <h3>Registro de correo en estadio</h3>

      <label>
        Nombre *
        <input
          type="text"
          value={data.nombre || ''}
          onChange={(e) => update({ nombre: e.target.value })}
          aria-invalid={Boolean(errors.nombre)}
        />
        {errors.nombre && <div className="error-message">{errors.nombre}</div>}
      </label>

      <label>
        Apellido *
        <input
          type="text"
          value={data.apellido || ''}
          onChange={(e) => update({ apellido: e.target.value })}
          aria-invalid={Boolean(errors.apellido)}
        />
        {errors.apellido && <div className="error-message">{errors.apellido}</div>}
      </label>

      <label>
        Correo electrónico *
        <input
          type="email"
          value={data.email || ''}
          onChange={(e) => update({ email: e.target.value })}
          aria-invalid={Boolean(errors.email)}
          placeholder="correo@ejemplo.com"
        />
        {errors.email && <div className="error-message">{errors.email}</div>}
      </label>

      <label>
        Teléfono *
        <input
          type="tel"
          value={data.telefono || ''}
          onChange={(e) => update({ telefono: e.target.value })}
          aria-invalid={Boolean(errors.telefono)}
          placeholder="333 123 4567"
        />
        {errors.telefono && <div className="error-message">{errors.telefono}</div>}
      </label>

      <label>
        Municipio / ciudad *
        <input
          type="text"
          value={data.municipio || ''}
          onChange={(e) => update({ municipio: e.target.value })}
          aria-invalid={Boolean(errors.municipio)}
          placeholder="Ej. Guadalajara"
        />
        {errors.municipio && <div className="error-message">{errors.municipio}</div>}
      </label>

      <label>
        ¿Con qué frecuencia nos visitas? *
        <select
          value={data.frecuenciaVisita || ''}
          onChange={(e) => update({ frecuenciaVisita: e.target.value })}
          aria-invalid={Boolean(errors.frecuenciaVisita)}
        >
          <option value="">-- Selecciona --</option>
          <option value="cada-serie">Al menos una vez por serie</option>
          <option value="dos-o-tres-series">Dos o tres series por temporada</option>
          <option value="ocasional">Ocasionalmente</option>
          <option value="primera-vez">Es mi primera vez</option>
        </select>
        {errors.frecuenciaVisita && <div className="error-message">{errors.frecuenciaVisita}</div>}
      </label>
    </section>
  )
}
