import React from 'react'
import { getJerseyOrdinal, MAX_ABONOS } from './jerseyOrdinals'

export const JERSEY_SIZES = ['S', 'M', 'L', 'XL', '2XL']
export const ABONO_ZONES = ['VIP', 'PREFERENTE', 'GENERAL']

const ABONOS_OPTIONS = Array.from({ length: MAX_ABONOS }, (_, index) => index + 1)

export function normalizeSeatText(value) {
  return String(value || '').toLocaleUpperCase('es-MX').replace(/[^A-ZÁÉÍÓÚÜÑ ]/g, '').replace(/\s+/g, ' ').slice(0, 10)
}

export function normalizeSeatNumber(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 2)
}

export function zoneIncludesJersey(zone) {
  return zone === 'VIP' || zone === 'PREFERENTE'
}

function getSelectedQuantity(value) {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_ABONOS ? quantity : 0
}

function ErrorMessage({ id, message }) {
  if (!message) return null
  return <div id={id} className="error-message">{message}</div>
}

function updateUnit(data, update, selectedQuantity, index, patch) {
  const units = Array.from({ length: selectedQuantity }, (_, unitIndex) => data.unidadesAbono?.[unitIndex] || {
    zona: '', tallaJersey: '', personalizacionTexto: '', personalizacionNumero: ''
  })
  units[index] = { ...units[index], ...patch }
  if (patch.zona && !zoneIncludesJersey(patch.zona)) units[index].tallaJersey = ''
  update({ unidadesAbono: units })
}

export default function AbonadosDetailsStep({ data, update, errors = {} }) {
  const selectedQuantity = getSelectedQuantity(data.cantidadAbonos)

  return (
    <section aria-labelledby="abonados-details-title">
      <h3 id="abonados-details-title">Datos del abonado</h3>
      <p>Registra tus datos y personaliza cada uno de tus abonos.</p>

      <div className="form-field">
        <label htmlFor="abonado-nombre">Nombre *</label>
        <input id="abonado-nombre" name="nombre" type="text" autoComplete="given-name" maxLength={100} value={data.nombre || ''}
          onChange={(event) => update({ nombre: event.target.value })} aria-invalid={Boolean(errors.nombre)} />
        <ErrorMessage id="abonado-nombre-error" message={errors.nombre} />
      </div>
      <div className="form-field">
        <label htmlFor="abonado-apellido">Apellido *</label>
        <input id="abonado-apellido" name="apellido" type="text" autoComplete="family-name" maxLength={100} value={data.apellido || ''}
          onChange={(event) => update({ apellido: event.target.value })} aria-invalid={Boolean(errors.apellido)} />
        <ErrorMessage id="abonado-apellido-error" message={errors.apellido} />
      </div>
      <div className="form-field">
        <label htmlFor="abonado-email">Correo electrónico *</label>
        <input id="abonado-email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254}
          placeholder="correo@ejemplo.com" value={data.email || ''} onChange={(event) => update({ email: event.target.value })}
          aria-invalid={Boolean(errors.email)} />
        <ErrorMessage id="abonado-email-error" message={errors.email} />
      </div>
      <div className="form-field">
        <label htmlFor="abonado-telefono">Número de teléfono *</label>
        <input id="abonado-telefono" name="telefono" type="tel" autoComplete="tel" inputMode="tel" maxLength={30}
          placeholder="333 123 4567" value={data.telefono || ''} onChange={(event) => update({ telefono: event.target.value })}
          aria-invalid={Boolean(errors.telefono)} />
        <ErrorMessage id="abonado-telefono-error" message={errors.telefono} />
      </div>
      <div className="form-field">
        <label htmlFor="abonado-cantidad-abonos">¿Cuántos abonos tienes? *</label>
        <select id="abonado-cantidad-abonos" name="cantidadAbonos" value={data.cantidadAbonos ?? ''}
          onChange={(event) => {
            if (!event.target.value) return update({ cantidadAbonos: '', unidadesAbono: [] })
            const cantidadAbonos = Number(event.target.value)
            update({ cantidadAbonos, unidadesAbono: Array.from({ length: cantidadAbonos }, (_, index) => data.unidadesAbono?.[index] || {
              zona: '', tallaJersey: '', personalizacionTexto: '', personalizacionNumero: ''
            }) })
          }} required aria-invalid={Boolean(errors.cantidadAbonos)}>
          <option value="">-- Selecciona una cantidad --</option>
          {ABONOS_OPTIONS.map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
        </select>
        <ErrorMessage id="abonado-cantidad-abonos-error" message={errors.cantidadAbonos} />
      </div>

      {Array.from({ length: selectedQuantity }, (_, index) => {
        const position = index + 1
        const unit = data.unidadesAbono?.[index] || {}
        const unitErrors = errors.unidadesAbono?.[index] || {}
        return (
          <fieldset className="subscriber-unit-card" key={`abono-${position}`}>
            <legend>Abono {position}</legend>
            <div className="form-field">
              <label htmlFor={`abonado-zona-${position}`}>Zona del abono *</label>
              <select id={`abonado-zona-${position}`} value={unit.zona || ''}
                onChange={(event) => updateUnit(data, update, selectedQuantity, index, { zona: event.target.value })}
                required aria-invalid={Boolean(unitErrors.zona)}>
                <option value="">-- Selecciona una zona --</option>
                <option value="VIP">VIP</option><option value="PREFERENTE">Preferente</option><option value="GENERAL">General</option>
              </select>
              <ErrorMessage id={`abonado-zona-${position}-error`} message={unitErrors.zona} />
            </div>
            {zoneIncludesJersey(unit.zona) && (
              <div className="form-field">
                <label htmlFor={`abonado-talla-${position}`}>¿Qué talla te gustaría para tu {getJerseyOrdinal(position)} jersey? *</label>
                <select id={`abonado-talla-${position}`} value={unit.tallaJersey || ''}
                  onChange={(event) => updateUnit(data, update, selectedQuantity, index, { tallaJersey: event.target.value })}
                  required aria-invalid={Boolean(unitErrors.tallaJersey)}>
                  <option value="">-- Selecciona una talla --</option>
                  {JERSEY_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                <ErrorMessage id={`abonado-talla-${position}-error`} message={unitErrors.tallaJersey} />
              </div>
            )}
            <div className="personalization-heading"><strong>Personalización de butaca</strong><small>Ejemplo: MARTINEZ - 22</small></div>
            <div className="personalization-grid">
              <div className="form-field">
                <label htmlFor={`abonado-personalizacion-${position}`}>Texto (1 a 10 letras) *</label>
                <input id={`abonado-personalizacion-${position}`} type="text" maxLength={10} value={unit.personalizacionTexto || ''}
                  placeholder="MARTINEZ" onChange={(event) => updateUnit(data, update, selectedQuantity, index, {
                    personalizacionTexto: normalizeSeatText(event.target.value)
                  })} required aria-invalid={Boolean(unitErrors.personalizacionTexto)} />
                <ErrorMessage id={`abonado-personalizacion-${position}-error`} message={unitErrors.personalizacionTexto} />
              </div>
              <div className="form-field">
                <label htmlFor={`abonado-numero-${position}`}>Número (máximo 2 dígitos) *</label>
                <input id={`abonado-numero-${position}`} type="text" inputMode="numeric" maxLength={2}
                  value={unit.personalizacionNumero || ''} placeholder="22"
                  onChange={(event) => updateUnit(data, update, selectedQuantity, index, {
                    personalizacionNumero: normalizeSeatNumber(event.target.value)
                  })} required aria-invalid={Boolean(unitErrors.personalizacionNumero)} />
                <ErrorMessage id={`abonado-numero-${position}-error`} message={unitErrors.personalizacionNumero} />
              </div>
            </div>
          </fieldset>
        )
      })}
    </section>
  )
}
