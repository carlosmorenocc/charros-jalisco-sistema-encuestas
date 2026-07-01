import React, { useEffect, useRef, useState } from 'react'
import ProgressBar from './ProgressBar'
import StepContact from './steps/StepContact'
import StepFanProfile from './steps/StepFanProfile'
import StepExperience from './steps/StepExperience'
import StepClubCharros from './steps/StepClubCharros'
import StepPromotions from './steps/StepPromotions'
import PrivacyConsent from './PrivacyConsent'
import ThankYou from './ThankYou'
import { submitForm } from '../services/submitForm'
import { stepValidations, validateStep } from '../utils/validation'

const STEPS = [
  { id: 'contact', label: 'Contacto', comp: StepContact },
  { id: 'profile', label: 'Perfil', comp: StepFanProfile },
  { id: 'experience', label: 'Experiencia', comp: StepExperience },
  { id: 'club', label: 'Club Charros', comp: StepClubCharros },
  { id: 'promotions', label: 'Promociones', comp: StepPromotions },
  { id: 'privacy', label: 'Aviso', comp: PrivacyConsent }
]

export default function MultiStepForm() {
  const [index, setIndex] = useState(0)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [stepErrors, setStepErrors] = useState({})
  const [data, setData] = useState({
    campaignName: 'Encuesta Oficial Charros 2026-2027',
    source: 'landing'
  })
  const formRef = useRef(null)

  const StepComponent = STEPS[index].comp
  const currentStepId = STEPS[index].id

  useEffect(() => {
    if (!formRef.current) return
    formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [index])

  function update(part) {
    setData(prev => ({ ...prev, ...part }))
    setStepErrors({}) // Clear errors when user updates
  }

  function validateCurrentStep() {
    const rules = stepValidations[currentStepId]
    const errors = getStepErrors(currentStepId, data)
    if (Object.keys(errors).length > 0) {
      setStepErrors(errors)
      return false
    }
    setStepErrors({})
    return true
  }

  function getStepErrors(stepId, formData) {
    const rules = stepValidations[stepId]
    const baseErrors = rules ? validateStep(formData, rules) : {}

    if (stepId === 'club' && formData.abonadoClubStatus === 'fui-abonado' && !String(formData.razonNoRenovo || '').trim()) {
      baseErrors.razonNoRenovo = 'Comparte tu experiencia como ex abonado.'
    }

    if (stepId === 'promotions') {
      const hasOther = Array.isArray(formData.tipoInformacion) && formData.tipoInformacion.includes('Otro')
      if (hasOther && !String(formData.tipoInformacionOtro || '').trim()) {
        baseErrors.tipoInformacionOtro = 'Especifica el otro tipo de información.'
      }
    }

    return baseErrors
  }

  function getFirstInvalidStep(formData) {
    for (let i = 0; i < STEPS.length; i += 1) {
      const stepId = STEPS[i].id
      const errors = getStepErrors(stepId, formData)
      if (Object.keys(errors).length > 0) {
        return { index: i, stepId, errors }
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

    if (index < STEPS.length - 1) {
      setIndex(i => i + 1)
    } else {
      await handleSubmit()
    }
  }

  function handleBack() {
    if (index > 0) {
      setIndex(i => i - 1)
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
        setError(`Faltan respuestas por completar en "${STEPS[invalidStep.index].label}".`)
        return
      }

      const coerceArray = (v) => {
        if (!v && v !== 0) return []
        if (Array.isArray(v)) return v
        if (typeof v === 'string') return v.split(',').map(s=>s.trim()).filter(Boolean)
        return [v]
      }

      const payload = {
        submissionId: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        timestamp: new Date().toISOString(),
        campaignName: data.campaignName,
        source: data.source,
        nombre: data.nombre || '',
        apellido: data.apellido || '',
        email: data.email || '',
        telefono: data.telefono || '',
        myCashlessId: data.myCashlessId || '',
        rangoEdad: data.rangoEdad || '',
        sexo: data.sexo || '',
        municipio: data.municipio || '',
        relacionCharros: data.abonadoClubStatus || data.relacionCharros || '',
        antiguedad: data.antiguedad || '',
        acompanantes: data.acompanantes || '',
        motivacion: data.motivacion || '',
        calificacionExperiencia: data.calificacionExperiencia || '',
        aspectosDisfrutados: coerceArray(data.aspectosDisfrutados || data.aspectosDisfrutadosText),
        aspectosDisfrutadosOtro: data.aspectosDisfrutadosOtro || '',
        aspectosMejorar: coerceArray(data.aspectosMejorar || data.aspectosMejorarText),
        comentarioExperiencia: data.comentarioExperiencia || '',
        facilidadMyCashless: data.facilidadMyCashless || '',
        comentarioMyCashless: data.comentarioMyCashless || '',
        consumoEstadio: data.facilidadMyCashless || data.consumoEstadio || '',
        interesClubCharros: data.interesClubCharros || '',
        razonNoRenovo: data.razonNoRenovo || '',
        beneficioPreferido: coerceArray(data.beneficioPreferido || data.beneficioPreferidoText),
        canalPromociones: coerceArray(data.canalPromociones || data.canalPromocionesMain),
        tipoInformacion: coerceArray(data.tipoInformacion || data.tipoInformacionText || data.tipoInformacion),
        tipoInformacionOtro: data.tipoInformacionOtro || '',
        comentario: data.comentario || '',
        aceptaAvisoPrivacidad: !!data.aceptaAvisoPrivacidad,
        aceptaComunicaciones: !!data.aceptaComunicaciones
      }

      await submitForm(payload)
      setDone(true)
    } catch (err) {
      console.error(err)
      setError('Ocurrió un error al enviar. Intenta más tarde.')
    } finally {
      setSending(false)
    }
  }

  if (done) return <ThankYou />

  return (
    <form ref={formRef} className="survey-form" onSubmit={(e)=>{e.preventDefault();handleNext()}}>
      <ProgressBar current={index+1} total={STEPS.length} />
      <div style={{marginBottom:16}}>
        <strong>{STEPS[index].label}</strong>
      </div>
      <StepComponent data={data} update={update} errors={stepErrors} />

      {error && <div className="error-message" style={{marginTop:12}}>{error}</div>}

      <div className="form-controls">
        <button type="button" onClick={handleBack} disabled={index===0}>
          ← Atrás
        </button>
        <button type="submit" disabled={sending}>
          {index < STEPS.length - 1 ? 'Siguiente →' : (sending ? 'Enviando...' : 'Enviar mi respuesta')}
        </button>
      </div>
    </form>
  )
}
