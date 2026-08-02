import React from 'react'
import { getJerseySizeQuestion, MAX_ABONOS } from './jerseyOrdinals'

export const JERSEY_SIZES = ['S', 'M', 'L', 'XL', '2XL']

const ABONOS_OPTIONS = Array.from({ length: MAX_ABONOS }, (_, index) => index + 1)

function getSelectedQuantity(value) {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_ABONOS
    ? quantity
    : 0
}

function ErrorMessage({ id, message }) {
  if (!message) return null
  return <div id={id} className="error-message">{message}</div>
}

export default function AbonadosDetailsStep({ data, update, errors = {} }) {
  const selectedQuantity = getSelectedQuantity(data.cantidadAbonos)

  return (
    <section aria-labelledby="abonados-details-title">
      <h3 id="abonados-details-title">Datos del abonado</h3>
      <p>
        Registra tus datos e indica la talla de jersey correspondiente a cada uno de tus abonos.
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
        <label htmlFor="abonado-cantidad-abonos">¿Cuántos abonos tienes? *</label>
        <select
          id="abonado-cantidad-abonos"
          name="cantidadAbonos"
          value={data.cantidadAbonos ?? ''}
          onChange={(event) => {
            const rawValue = event.target.value
            if (!rawValue) {
              update({ cantidadAbonos: '', tallasJersey: [] })
              return
            }

            const cantidadAbonos = Number(rawValue)
            const currentSizes = Array.isArray(data.tallasJersey) ? data.tallasJersey : []
            update({
              cantidadAbonos,
              tallasJersey: Array.from(
                { length: cantidadAbonos },
                (_, index) => currentSizes[index] || ''
              )
            })
          }}
          required
          aria-invalid={Boolean(errors.cantidadAbonos)}
          aria-describedby={errors.cantidadAbonos ? 'abonado-cantidad-abonos-error' : undefined}
        >
          <option value="">-- Selecciona una cantidad --</option>
          {ABONOS_OPTIONS.map((quantity) => (
            <option key={quantity} value={quantity}>{quantity}</option>
          ))}
        </select>
        <ErrorMessage id="abonado-cantidad-abonos-error" message={errors.cantidadAbonos} />
      </div>

      {Array.from({ length: selectedQuantity }, (_, index) => {
        const position = index + 1
        const fieldId = `abonado-talla-${position}`
        const errorId = `${fieldId}-error`
        const fieldError = errors.tallasJersey?.[index]

        return (
          <div className="form-field" key={fieldId}>
            <label htmlFor={fieldId}>{getJerseySizeQuestion(position)} *</label>
            <select
              id={fieldId}
              name={`tallasJersey[${index}]`}
              value={data.tallasJersey?.[index] || ''}
              onChange={(event) => {
                const tallasJersey = Array.from(
                  { length: selectedQuantity },
                  (_, sizeIndex) => data.tallasJersey?.[sizeIndex] || ''
                )
                tallasJersey[index] = event.target.value
                update({ tallasJersey })
              }}
              required
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? errorId : undefined}
            >
              <option value="">-- Selecciona una talla --</option>
              {JERSEY_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <ErrorMessage id={errorId} message={fieldError} />
          </div>
        )
      })}
    </section>
  )
}
