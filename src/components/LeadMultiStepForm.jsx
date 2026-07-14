import React, { useEffect, useRef, useState } from 'react'
import ProgressBar from './ProgressBar'
import LeadStepContact from './leads/LeadStepContact'
import LeadStepPrivacy from './leads/LeadStepPrivacy'
import LeadThankYou from './leads/LeadThankYou'
import { submitLeadForm } from '../services/submitLeadForm'
import { validateStep } from '../utils/validation'

const LEAD_STEPS = [
  { id: 'contact', label: 'Contacto', comp: LeadStepContact },
  { id: 'privacy', label: 'Términos', comp: LeadStepPrivacy }
]

const leadStepValidations = {
  contact: {
    nombre: [
      { rule: 'required', message: 'El nombre es obligatorio.' },
      { rule: 'minLength:2', message: 'El nombre debe tener al menos 2 caracteres.' }
    ],
    apellido: [
      { rule: 'required', message: 'El apellido es obligatorio.' },
      { rule: 'minLength:2', message: 'El apellido debe tener al menos 2 caracteres.' }
    ],
    email: [
      { rule: 'required', message: 'El correo es obligatorio.' },
      { rule: 'email', message: 'Ingresa un correo válido.' }
    ],
    telefono: [
      { rule: 'required', message: 'El teléfono es obligatorio.' },
      { rule: 'phone', message: 'El teléfono debe tener al menos 10 dígitos.' }
    ],
    municipio: [
      { rule: 'required', message: 'El municipio es obligatorio.' }
    ],
    frecuenciaVisita: [
      { rule: 'required', message: 'Selecciona la frecuencia de visita.' }
    ]
  },
  privacy: {
    aceptaAvisoPrivacidad: [
      { rule: 'required', message: 'Debes aceptar el Aviso de Privacidad.' }
    ],
    aceptaRegistroDiario: [
      { rule: 'required', message: 'Debes confirmar el registro diario por correo.' }
    ]
  }
}

export default function LeadMultiStepForm() {
  const [index, setIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [stepErrors, setStepErrors] = useState({})
  const [data, setData] = useState({
    campaignName: 'Registro de Correos Estadio Charros',
    source: 'stadium-leads'
  })
  const formRef = useRef(null)

  const StepComponent = LEAD_STEPS[index].comp
  const currentStepId = LEAD_STEPS[index].id

  useEffect(() => {
    if (!formRef.current) return
    formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [index])

  function update(part) {
    setData((prev) => ({ ...prev, ...part }))
    setStepErrors({})
  }

  function getStepErrors(stepId, formData) {
    const rules = leadStepValidations[stepId]
    return rules ? validateStep(formData, rules) : {}
  }

  function validateCurrentStep() {
    const errors = getStepErrors(currentStepId, data)
    if (Object.keys(errors).length > 0) {
      setStepErrors(errors)
      return false
    }
    setStepErrors({})
    return true
  }

  function getFirstInvalidStep(formData) {
    for (let i = 0; i < LEAD_STEPS.length; i += 1) {
      const stepId = LEAD_STEPS[i].id
      const errors = getStepErrors(stepId, formData)
      if (Object.keys(errors).length > 0) {
        return { index: i, errors }
      }
    }
    return null
  }

  async function handleNext() {
    setError('')

    if (!validateCurrentStep()) {
      setError('Por favor completa todos los campos requeridos.')
      return
    }

    if (index < LEAD_STEPS.length - 1) {
      setIndex((i) => i + 1)
      return
    }

    await handleSubmit()
  }

  function handleBack() {
    if (index > 0) {
      setIndex((i) => i - 1)
      setError('')
      setStepErrors({})
    }
  }

  async function handleSubmit() {
    setSending(true)
    setError('')
    try {
      const invalidStep = getFirstInvalidStep(data)
      if (invalidStep) {
        setIndex(invalidStep.index)
        setStepErrors(invalidStep.errors)
        setError(`Faltan respuestas por completar en \"${LEAD_STEPS[invalidStep.index].label}\".`)
        return
      }

      const payload = {
        submissionId: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        timestamp: new Date().toISOString(),
        campaignName: data.campaignName,
        source: data.source,
        nombre: data.nombre || '',
        apellido: data.apellido || '',
        email: data.email || '',
        telefono: data.telefono || '',
        municipio: data.municipio || '',
        frecuenciaVisita: data.frecuenciaVisita || '',
        aceptaAvisoPrivacidad: !!data.aceptaAvisoPrivacidad,
        aceptaComunicaciones: !!data.aceptaComunicaciones,
        aceptaRegistroDiario: !!data.aceptaRegistroDiario
      }

      await submitLeadForm(payload)
      setDone(true)
    } catch (err) {
      const message = String(err?.message || '')
      if (message.includes('409') || message.toLowerCase().includes('daily email limit')) {
        setError('Este correo ya se registró hoy. Intenta nuevamente en el siguiente juego.')
      } else {
        setError('Ocurrió un error al registrar el correo. Intenta más tarde.')
      }
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  if (done) return <LeadThankYou />

  return (
    <form ref={formRef} className="survey-form" onSubmit={(e) => { e.preventDefault(); handleNext(); }}>
      <ProgressBar current={index + 1} total={LEAD_STEPS.length} />
      <div style={{ marginBottom: 16 }}>
        <strong>{LEAD_STEPS[index].label}</strong>
      </div>

      <StepComponent data={data} update={update} errors={stepErrors} />

      {error && <div className="error-message" style={{ marginTop: 12 }}>{error}</div>}

      <div className="form-controls">
        <button type="button" onClick={handleBack} disabled={index === 0}>
          ← Atrás
        </button>
        <button type="submit" disabled={sending}>
          {index < LEAD_STEPS.length - 1 ? 'Siguiente →' : (sending ? 'Registrando...' : 'Registrarme')}
        </button>
      </div>
    </form>
  )
}
