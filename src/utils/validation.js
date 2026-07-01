export const validation = {
  // Email validation
  isValidEmail: (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  },

  // Phone formatting (México): formato +52 9999 999999 o simple
  formatPhone: (phone) => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    if (cleaned.length === 11 && cleaned.startsWith('52')) {
      return `+52-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`
    }
    return phone
  },

  // Validate phone format
  isValidPhone: (phone) => {
    if (!phone) return true // optional
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) return true
    if (cleaned.length === 12 && cleaned.startsWith('52')) return true
    return false
  },

  // Age range validation (12-120)
  isValidAge: (age) => {
    const num = parseInt(age)
    return num >= 12 && num <= 120
  },

  // Required field
  isRequired: (value) => {
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    return !!value
  },

  // Min length
  minLength: (value, length) => {
    return value.toString().length >= length
  },

  // Max length
  maxLength: (value, length) => {
    return value.toString().length <= length
  }
}

// Validation rules per step
export const stepValidations = {
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
    rangoEdad: [
      { rule: 'required', message: 'Selecciona un rango de edad.' }
    ],
    sexo: [
      { rule: 'required', message: 'Selecciona una opción.' }
    ],
    municipio: [
      { rule: 'required', message: 'Ingresa tu municipio o ciudad.' }
    ],
    telefono: [
      { rule: 'required', message: 'El teléfono es obligatorio.' },
      { rule: 'phone', message: 'El teléfono debe tener al menos 10 dígitos.' }
    ],
    myCashlessId: [
      { rule: 'required', message: 'El ID de MyCashless es obligatorio.' }
    ]
  },
  profile: {
    relacionCharros: [
      { rule: 'required', message: 'Selecciona tu relación con Charros.' }
    ],
    antiguedad: [
      { rule: 'required', message: 'Selecciona desde cuándo asistes.' }
    ],
    acompanantes: [
      { rule: 'required', message: 'Selecciona con quién sueles venir.' }
    ],
    motivacion: [
      { rule: 'required', message: 'Selecciona tu principal razón para venir.' }
    ]
  },
  experience: {
    calificacionExperiencia: [
      { rule: 'required', message: 'Selecciona una calificación de experiencia.' }
    ],
    aspectosDisfrutados: [
      { rule: 'required', message: 'Selecciona al menos un aspecto que disfrutas.' }
    ],
    facilidadMyCashless: [
      { rule: 'required', message: 'Selecciona qué tan fácil te resulta usar MyCashless.' }
    ],
    comentarioMyCashless: [
      { rule: 'required', message: 'Comparte tu opinión sobre la atención en módulos MyCashless.' }
    ]
  },
  club: {
    interesClubCharros: [
      { rule: 'required', message: 'Selecciona tu interés en Club Charros.' }
    ],
    abonadoClubStatus: [
      { rule: 'required', message: 'Selecciona si eres abonado.' }
    ],
    beneficioPreferido: [
      { rule: 'required', message: 'Selecciona al menos un beneficio preferido.' }
    ]
  },
  promotions: {
    canalPromocionesMain: [
      { rule: 'required', message: 'Selecciona tu canal principal de promociones.' }
    ],
    tipoInformacion: [
      { rule: 'required', message: 'Selecciona al menos un tipo de información.' }
    ]
  },
  privacy: {
    aceptaAvisoPrivacidad: [
      { rule: 'required', message: 'Debes aceptar el Aviso de Privacidad para continuar.' }
    ]
  }
}

// Validate single field
export const validateField = (fieldName, value, stepValidations) => {
  if (!stepValidations || !stepValidations[fieldName]) return null

  const rules = stepValidations[fieldName]
  for (const ruleObj of rules) {
    const { rule, message } = ruleObj
    const [ruleName, param] = rule.split(':')

    let isValid = false
    switch (ruleName) {
      case 'required':
        isValid = validation.isRequired(value)
        break
      case 'email':
        isValid = !value || validation.isValidEmail(value)
        break
      case 'phone':
        isValid = validation.isValidPhone(value)
        break
      case 'minLength':
        isValid = !value || validation.minLength(value, parseInt(param))
        break
      case 'maxLength':
        isValid = !value || validation.maxLength(value, parseInt(param))
        break
      default:
        isValid = true
    }

    if (!isValid) return message
  }

  return null
}

// Validate entire step
export const validateStep = (stepData, stepValidations) => {
  const errors = {}
  for (const fieldName in stepValidations) {
    const error = validateField(fieldName, stepData[fieldName], { [fieldName]: stepValidations[fieldName] })
    if (error) errors[fieldName] = error
  }
  return errors
}
