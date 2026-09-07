import React, { useEffect, useRef, useState } from 'react'
import ProgressBar from '../../components/ProgressBar'
import { validateStep } from '../../utils/validation'
import AbonadosDetailsStep, { JERSEY_SIZES } from './AbonadosDetailsStep'
import AbonadosDeliveryStep from './AbonadosDeliveryStep'
import AbonadosPrivacyStep from './AbonadosPrivacyStep'
import AbonadosThankYou from './AbonadosThankYou'
import { submitAbonadoForm } from './submitAbonadoForm'
import { getJerseyOrdinal, MAX_ABONOS } from './jerseyOrdinals'

const STEPS = [
  { id: 'details', label: 'Datos del abonado', component: AbonadosDetailsStep },
  { id: 'delivery', label: 'Entrega de abonos', component: AbonadosDeliveryStep },
  { id: 'privacy', label: 'Aviso', component: AbonadosPrivacyStep }
]

const STEP_VALIDATIONS = {
  details: {
    nombre: [{ rule: 'required', message: 'El nombre es obligatorio.' }, { rule: 'minLength:2', message: 'El nombre debe tener al menos 2 caracteres.' }, { rule: 'maxLength:100', message: 'El nombre no puede superar 100 caracteres.' }],
    apellido: [{ rule: 'required', message: 'El apellido es obligatorio.' }, { rule: 'minLength:2', message: 'El apellido debe tener al menos 2 caracteres.' }, { rule: 'maxLength:100', message: 'El apellido no puede superar 100 caracteres.' }],
    email: [{ rule: 'required', message: 'El correo es obligatorio.' }, { rule: 'email', message: 'Ingresa un correo válido.' }, { rule: 'maxLength:254', message: 'El correo es demasiado largo.' }],
    telefono: [{ rule: 'required', message: 'El teléfono es obligatorio.' }, { rule: 'phone', message: 'Ingresa un teléfono de 10 dígitos.' }],
    cantidadAbonos: [{ rule: 'required', message: 'Selecciona cuántos abonos tienes.' }]
  },
  delivery: {},
  privacy: { aceptaAvisoPrivacidad: [{ rule: 'required', message: 'Debes aceptar el Aviso de Privacidad.' }] }
}

function getStepErrors(stepId, data) {
  const errors = validateStep(data, STEP_VALIDATIONS[stepId] || {})
  if (stepId === 'details') {
    const quantity = Number(data.cantidadAbonos)
    const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_ABONOS
    if (data.cantidadAbonos && !validQuantity) errors.cantidadAbonos = `Selecciona una cantidad válida entre 1 y ${MAX_ABONOS}.`
    if (validQuantity) {
      const units = Array.isArray(data.unidadesAbono) ? data.unidadesAbono : []
      const unitErrors = Array.from({ length: quantity }, (_, index) => {
        const unit = units[index] || {}
        const current = {}
        if (!['VIP', 'PREFERENTE', 'GENERAL'].includes(unit.zona)) current.zona = 'Selecciona la zona de este abono.'
        if (['VIP', 'PREFERENTE'].includes(unit.zona) && !JERSEY_SIZES.includes(unit.tallaJersey)) {
          current.tallaJersey = `Selecciona una talla para tu ${getJerseyOrdinal(index + 1)} jersey.`
        }
        if (!/^(?=.*[A-ZÁÉÍÓÚÜÑ])[A-ZÁÉÍÓÚÜÑ ]{1,10}$/.test(unit.personalizacionTexto || '')) current.personalizacionTexto = 'Ingresa entre 1 y 10 letras.'
        if (!/^\d{1,2}$/.test(unit.personalizacionNumero || '')) current.personalizacionNumero = 'Ingresa un número de 1 o 2 dígitos.'
        return current
      })
      if (unitErrors.some((item) => Object.keys(item).length)) errors.unidadesAbono = unitErrors
    }
  }
  if (stepId === 'delivery') {
    if (!['SI', 'NO'].includes(data.boletoMovilLigado)) errors.boletoMovilLigado = 'Selecciona Sí o No.'
    if (data.boletoMovilLigado === 'NO') {
      if (!/^\d{1,20}$/.test(data.boletoMovilId || '')) errors.boletoMovilId = 'Ingresa un ID numérico válido.'
      if (!['APP_BOLETOMOVIL', 'PDF'].includes(data.preferenciaEntrega)) errors.preferenciaEntrega = 'Selecciona cómo prefieres recibir tus boletos.'
    }
  }
  return errors
}

export default function AbonadosMultiStepForm() {
  const [index, setIndex] = useState(0)
  const [data, setData] = useState({})
  const [stepErrors, setStepErrors] = useState({})
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const formRef = useRef(null)
  const currentStep = STEPS[index]
  const StepComponent = currentStep.component

  useEffect(() => { formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) }, [index])

  function update(partialData) {
    setData((current) => ({ ...current, ...partialData }))
    setStepErrors({})
    setError('')
  }

  function validateCurrentStep() {
    const errors = getStepErrors(currentStep.id, data)
    setStepErrors(errors)
    return Object.keys(errors).length === 0
  }

  function findFirstInvalidStep() {
    for (let stepIndex = 0; stepIndex < STEPS.length; stepIndex += 1) {
      const errors = getStepErrors(STEPS[stepIndex].id, data)
      if (Object.keys(errors).length) return { stepIndex, errors }
    }
    return null
  }

  async function submit() {
    const invalid = findFirstInvalidStep()
    if (invalid) {
      setIndex(invalid.stepIndex); setStepErrors(invalid.errors)
      setError(`Faltan respuestas por completar en “${STEPS[invalid.stepIndex].label}”.`)
      return
    }
    setSending(true); setError('')
    try {
      await submitAbonadoForm({
        nombre: data.nombre.trim(), apellido: data.apellido.trim(), email: data.email.trim().toLowerCase(), telefono: data.telefono.trim(),
        cantidadAbonos: Number(data.cantidadAbonos), unidadesAbono: data.unidadesAbono.slice(0, Number(data.cantidadAbonos)),
        boletoMovilLigado: data.boletoMovilLigado,
        boletoMovilId: data.boletoMovilLigado === 'NO' ? data.boletoMovilId : '',
        preferenciaEntrega: data.boletoMovilLigado === 'NO' ? data.preferenciaEntrega : '',
        aceptaAvisoPrivacidad: Boolean(data.aceptaAvisoPrivacidad), aceptaComunicaciones: Boolean(data.aceptaComunicaciones)
      })
      setDone(true)
    } catch (submissionError) {
      setError(submissionError?.status === 409 ? 'Este correo ya cuenta con un registro para la temporada LMP 2026-2027.' : 'No pudimos guardar tu registro. Revisa tu conexión e intenta nuevamente.')
    } finally { setSending(false) }
  }

  async function handleNext() {
    if (sending) return
    setError('')
    if (!validateCurrentStep()) return setError('Por favor completa todos los campos requeridos.')
    if (index < STEPS.length - 1) return setIndex((current) => current + 1)
    await submit()
  }

  if (done) return <AbonadosThankYou />
  return (
    <form ref={formRef} className="survey-form" noValidate onSubmit={(event) => { event.preventDefault(); handleNext() }}>
      <ProgressBar current={index + 1} total={STEPS.length} />
      <StepComponent data={data} update={update} errors={stepErrors} />
      {error && <div className="error-message" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      <div className="form-controls">
        <button type="button" onClick={() => { if (index && !sending) { setIndex((current) => current - 1); setStepErrors({}); setError('') } }} disabled={index === 0 || sending}>← Atrás</button>
        <button type="submit" disabled={sending}>{index < STEPS.length - 1 ? 'Siguiente →' : (sending ? 'Guardando...' : 'Terminar de registrarme')}</button>
      </div>
    </form>
  )
}
