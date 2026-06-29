import React from 'react'
import FormField from '../FormField'
import { ageRanges, genders } from '../../data/questions'
import { stepValidations } from '../../utils/validation'

export default function StepContact({ data, update }) {
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
        label="Número de teléfono (opcional)"
        type="tel"
        value={data.telefono}
        onChange={update}
        validations={stepValidations.contact.telefono}
        placeholder="333 1234567"
      />

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
        type="text"
        value={data.municipio}
        onChange={update}
        validations={stepValidations.contact.municipio}
        placeholder="Ej: Guadalajara"
        required
      />
    </section>
  )
}
