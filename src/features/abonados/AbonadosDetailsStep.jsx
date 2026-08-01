import React from 'react'

export const JERSEY_SIZES = ['S', 'M', 'L', 'XL', '2XL']

function ErrorMessage({ id, message }) {
  if (!message) return null
  return <div id={id} className="error-message">{message}</div>
}

export default function AbonadosDetailsStep({ data, update, errors = {} }) {
  return (
    <section aria-labelledby="abonados-details-title">
      <h3 id="abonados-details-title">Datos del abonado</h3>
      <p>
        Registra tus datos y selecciona una talla. La captura de talla no confirma por sí sola
        disponibilidad ni entrega del jersey.
      </p>

      <div className="form-field">
        <label htmlFor="abonado-nombre">Nombre *</label>
        <input
          id="abonado-nombre"
          name="nombre"
          type="text"
          autoComplete="given-name"
          maxLength={100}
          value={data.nombre || ''}
          onChange={(event) => update({ nombre: event.target.value })}
          aria-invalid={Boolean(errors.nombre)}
          aria-describedby={errors.nombre ? 'abonado-nombre-error' : undefined}
        />
        <ErrorMessage id="abonado-nombre-error" message={errors.nombre} />
      </div>

      <div className="form-field">
        <label htmlFor="abonado-apellido">Apellido *</label>
        <input
          id="abonado-apellido"
          name="apellido"
          type="text"
          autoComplete="family-name"
          maxLength={100}
          value={data.apellido || ''}
          onChange={(event) => update({ apellido: event.target.value })}
          aria-invalid={Boolean(errors.apellido)}
          aria-describedby={errors.apellido ? 'abonado-apellido-error' : undefined}
        />
        <ErrorMessage id="abonado-apellido-error" message={errors.apellido} />
      </div>

      <div className="form-field">
        <label htmlFor="abonado-email">Correo electrónico *</label>
        <input
          id="abonado-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          placeholder="correo@ejemplo.com"
          value={data.email || ''}
          onChange={(event) => update({ email: event.target.value })}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'abonado-email-error' : undefined}
        />
        <ErrorMessage id="abonado-email-error" message={errors.email} />
      </div>

      <div className="form-field">
        <label htmlFor="abonado-telefono">Número de teléfono *</label>
        <input
          id="abonado-telefono"
          name="telefono"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          maxLength={30}
          placeholder="333 123 4567"
          value={data.telefono || ''}
          onChange={(event) => update({ telefono: event.target.value })}
          aria-invalid={Boolean(errors.telefono)}
          aria-describedby={errors.telefono ? 'abonado-telefono-error' : undefined}
        />
        <ErrorMessage id="abonado-telefono-error" message={errors.telefono} />
      </div>

      <div className="form-field">
        <label htmlFor="abonado-talla">¿Cuál es tu talla de jersey? *</label>
        <select
          id="abonado-talla"
          name="tallaJersey"
          value={data.tallaJersey || ''}
          onChange={(event) => update({ tallaJersey: event.target.value })}
          aria-invalid={Boolean(errors.tallaJersey)}
          aria-describedby={errors.tallaJersey ? 'abonado-talla-error' : undefined}
        >
          <option value="">-- Selecciona una talla --</option>
          {JERSEY_SIZES.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <ErrorMessage id="abonado-talla-error" message={errors.tallaJersey} />
      </div>
    </section>
  )
}
