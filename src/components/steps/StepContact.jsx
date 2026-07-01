import React from 'react'
import FormField from '../FormField'
import { ageRanges, genders, jaliscoMunicipios } from '../../data/questions'
import { stepValidations } from '../../utils/validation'
import myCashlessGuide from '../../assets/Mycashless.png'
import infoIcon from '../../assets/info-icon.png'

export default function StepContact({ data, update, errors = {} }) {
  return (
    <section>
      <h3>Datos de contacto</h3>

      <FormField
        name="nombre"
        label="Nombre"
        type="text"
        value={data.nombre}
        onChange={update}
        validations={stepValidations.contact.nombre}
        required
      />

      <FormField
        name="apellido"
        label="Apellido"
        type="text"
        value={data.apellido}
        onChange={update}
        validations={stepValidations.contact.apellido}
        required
      />

      <FormField
        name="email"
        label="Correo electrónico"
        type="email"
        value={data.email}
        onChange={update}
        validations={stepValidations.contact.email}
        placeholder="correo@example.com"
        required
      />

      <FormField
        name="telefono"
        label="Número de teléfono"
        type="tel"
        value={data.telefono}
        onChange={update}
        validations={stepValidations.contact.telefono}
        placeholder="333 123 4567"
        required
      />

      <div className="form-field mycashless-field">
        <label htmlFor="myCashlessId" className="form-label">
          ID de MyCashless <span style={{ color: 'var(--red)' }}> *</span>
          <span
            className="tooltip-anchor"
            tabIndex={0}
            aria-label="Ver información para encontrar el ID de MyCashless"
          >
            <img src={infoIcon} alt="Información" className="info-icon" />
            <div className="mycashless-tooltip" role="tooltip">
              <p className="mycashless-tooltip-title">¿Dónde encuentro el ID de MyCashless?</p>
              <ul>
                <li>Está en la parte trasera de tu tarjeta MyCashless.</li>
                <li>Es un número de serie único de la tarjeta.</li>
                <li>Captúralo completo, sin espacios ni guiones.</li>
              </ul>
              <img src={myCashlessGuide} alt="Ejemplo de ubicación del ID en tarjeta MyCashless" className="mycashless-guide" />
            </div>
          </span>
        </label>

        <input
          id="myCashlessId"
          type="text"
          name="myCashlessId"
          value={data.myCashlessId || ''}
          onChange={(e) => update({ myCashlessId: e.target.value })}
          placeholder="Ej: 1234567890"
          aria-invalid={Boolean(errors.myCashlessId)}
        />
        {errors.myCashlessId && <div className="error-message">{errors.myCashlessId}</div>}
      </div>

      <FormField
        name="rangoEdad"
        label="Rango de edad"
        type="select"
        value={data.rangoEdad}
        onChange={update}
        validations={stepValidations.contact.rangoEdad}
        options={ageRanges}
        required
      />

      <FormField
        name="sexo"
        label="Sexo / identidad"
        type="select"
        value={data.sexo}
        onChange={update}
        validations={stepValidations.contact.sexo}
        options={genders}
        required
      />

      <FormField
        name="municipio"
        label="Municipio / ciudad desde donde nos visitas"
        type="select"
        value={data.municipio}
        onChange={update}
        validations={stepValidations.contact.municipio}
        options={jaliscoMunicipios}
        required
      />
    </section>
  )
}
