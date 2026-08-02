import React, { useEffect, useRef, useState } from 'react'
import ProgressBar from '../../components/ProgressBar'
import { validateStep } from '../../utils/validation'
import AbonadosDetailsStep, { JERSEY_SIZES } from './AbonadosDetailsStep'
import AbonadosPrivacyStep from './AbonadosPrivacyStep'
import AbonadosThankYou from './AbonadosThankYou'
import { submitAbonadoForm } from './submitAbonadoForm'
import { getJerseyOrdinal, MAX_ABONOS } from './jerseyOrdinals'

const STEPS = [
  { id: 'details', label: 'Datos del abonado', component: AbonadosDetailsStep },
  { id: 'privacy', label: 'Aviso', component: AbonadosPrivacyStep }
]

const STEP_VALIDATIONS = {
  details: {
    nombre: [
      { rule: 'required', message: 'El nombre es obligatorio.' },
      { rule: 'minLength:2', message: 'El nombre debe tener al menos 2 caracteres.' },
      { rule: 'maxLength:100', message: 'El nombre no puede superar 100 caracteres.' }
    ],
    apellido: [
      { rule: 'required', message: 'El apellido es obligatorio.' },
      { rule: 'minLength:2', message: 'El apellido debe tener al menos 2 caracteres.' },
      { rule: 'maxLength:100', message: 'El apellido no puede superar 100 caracteres.' }
    ],
    email: [
      { rule: 'required', message: 'El correo es obligatorio.' },
      { rule: 'email', message: 'Ingresa un correo válido.' },
      { rule: 'maxLength:254', message: 'El correo es demasiado largo.' }
    ],
    telefono: [
      { rule: 'required', message: 'El teléfono es obligatorio.' },
      { rule: 'phone', message: 'Ingresa un teléfono de 10 dígitos.' }
    ],
    cantidadAbonos: [
      { rule: 'required', message: 'Selecciona cuántos abonos tienes.' }
    ]
  },
  privacy: {
    aceptaAvisoPrivacidad: [
      { rule: 'required', message: 'Debes aceptar el Aviso de Privacidad.' }
    ]
  }
}

function getStepErrors(stepId, data) {
  const errors = validateStep(data, STEP_VALIDATIONS[stepId] || {})

  if (stepId === 'details') {
    const cantidadAbonos = Number(data.cantidadAbonos)
    const hasValidQuantity = Number.isInteger(cantidadAbonos)
      && cantidadAbonos >= 1
      && cantidadAbonos <= MAX_ABONOS

    if (data.cantidadAbonos && !hasValidQuantity) {
      errors.cantidadAbonos = `Selecciona una cantidad válida entre 1 y ${MAX_ABONOS}.`
    }

    if (hasValidQuantity) {
      const tallasJersey = Array.isArray(data.tallasJersey) ? data.tallasJersey : []
      const sizeErrors = Array.from({ length: cantidadAbonos }, (_, index) => {
        const size = tallasJersey[index]
        if (!size) return `Selecciona la talla de tu ${getJerseyOrdinal(index + 1)} jersey.`
        if (!JERSEY_SIZES.includes(size)) return 'Selecciona una talla válida.'
        return ''
      })

      if (sizeErrors.some(Boolean)) errors.tallasJersey = sizeErrors
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

  useEffect(() => {
    if (typeof formRef.current?.scrollIntoView === 'function') {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [index])

  function update(partialData) {
    setData((currentData) => ({ ...currentData, ...partialData }))
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
      if (Object.keys(errors).length > 0) return { stepIndex, errors }
    }
    return null
  }

  async function submit() {
    const invalid = findFirstInvalidStep()
    if (invalid) {
      setIndex(invalid.stepIndex)
      setStepErrors(invalid.errors)
      setError(`Faltan respuestas por completar en “${STEPS[invalid.stepIndex].label}”.`)
      return
    }

    setSending(true)
    setError('')

    try {
      await submitAbonadoForm({
        nombre: data.nombre.trim(),
        apellido: data.apellido.trim(),
        email: data.email.trim().toLowerCase(),
        telefono: data.telefono.trim(),
        cantidadAbonos: Number(data.cantidadAbonos),
        tallasJersey: data.tallasJersey.slice(0, Number(data.cantidadAbonos)),
        aceptaAvisoPrivacidad: Boolean(data.aceptaAvisoPrivacidad),
        aceptaComunicaciones: Boolean(data.aceptaComunicaciones)
      })
      setDone(true)
    } catch (submissionError) {
      if (submissionError?.status === 409) {
        setError('Este correo ya cuenta con un registro para la temporada LMP 2026-2027.')
      } else {
        setError('No pudimos guardar tu registro. Revisa tu conexión e intenta nuevamente.')
      }
    } finally {
      setSending(false)
    }
  }

  async function handleNext() {
    if (sending) return
    setError('')

    if (!validateCurrentStep()) {
      setError('Por favor completa todos los campos requeridos.')
      return
    }

    if (index < STEPS.length - 1) {
      setIndex((currentIndex) => currentIndex + 1)
      return
    }

    await submit()
  }

  function handleBack() {
    if (index === 0 || sending) return
    setIndex((currentIndex) => currentIndex - 1)
    setStepErrors({})
    setError('')
  }

  if (done) return <AbonadosThankYou />

  return (
    <form
      ref={formRef}
      className="survey-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        handleNext()
      }}
    >
      <ProgressBar current={index + 1} total={STEPS.length} />

      <StepComponent data={data} update={update} errors={stepErrors} />

      {error && (
        <div className="error-message" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      <div className="form-controls">
        <button type="button" onClick={handleBack} disabled={index === 0 || sending}>
          ← Atrás
        </button>
        <button type="submit" disabled={sending}>
          {index < STEPS.length - 1
            ? 'Siguiente →'
            : (sending ? 'Guardando...' : 'Terminar de registrarme')}
        </button>
      </div>
    </form>
  )
}
