import { describe, it, expect } from 'vitest'
import { validation, validateField, validateStep } from '../utils/validation'

describe('validation.isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(validation.isValidEmail('test@example.com')).toBe(true)
    expect(validation.isValidEmail('user+tag@domain.co.uk')).toBe(true)
  })

  it('rejects invalid emails', () => {
    expect(validation.isValidEmail('invalid')).toBe(false)
    expect(validation.isValidEmail('test@')).toBe(false)
    expect(validation.isValidEmail('test@domain')).toBe(false)
  })
})

describe('validation.isValidPhone', () => {
  it('accepts valid phone numbers', () => {
    expect(validation.isValidPhone('3331234567')).toBe(true)
    expect(validation.isValidPhone('52-333-1234567')).toBe(true)
  })

  it('accepts optional phone', () => {
    expect(validation.isValidPhone('')).toBe(true)
  })

  it('rejects short phone numbers', () => {
    expect(validation.isValidPhone('123')).toBe(false)
  })
})

describe('validation.isRequired', () => {
  it('accepts non-empty strings', () => {
    expect(validation.isRequired('text')).toBe(true)
  })

  it('rejects empty strings', () => {
    expect(validation.isRequired('')).toBe(false)
    expect(validation.isRequired('   ')).toBe(false)
  })

  it('accepts non-empty arrays', () => {
    expect(validation.isRequired(['item'])).toBe(true)
  })

  it('rejects empty arrays', () => {
    expect(validation.isRequired([])).toBe(false)
  })
})

describe('validation.minLength', () => {
  it('validates min length', () => {
    expect(validation.minLength('test', 2)).toBe(true)
    expect(validation.minLength('t', 2)).toBe(false)
  })
})

describe('validateField', () => {
  it('returns null for valid fields', () => {
    const rules = { nombre: [{ rule: 'required', message: 'Required' }] }
    expect(validateField('nombre', 'Juan', rules)).toBe(null)
  })

  it('returns error message for invalid fields', () => {
    const rules = { nombre: [{ rule: 'required', message: 'El nombre es obligatorio.' }] }
    const error = validateField('nombre', '', rules)
    expect(error).toBe('El nombre es obligatorio.')
  })
})

describe('validateStep', () => {
  it('returns empty object for valid step data', () => {
    const stepRules = {
      nombre: [{ rule: 'required', message: 'Required' }],
      email: [{ rule: 'email', message: 'Invalid email' }]
    }
    const data = { nombre: 'Juan', email: 'juan@example.com' }
    const errors = validateStep(data, stepRules)
    expect(Object.keys(errors).length).toBe(0)
  })

  it('returns errors for invalid fields', () => {
    const stepRules = {
      nombre: [{ rule: 'required', message: 'Required' }],
      email: [{ rule: 'email', message: 'Invalid email' }]
    }
    const data = { nombre: '', email: 'invalid' }
    const errors = validateStep(data, stepRules)
    expect(errors.nombre).toBe('Required')
    expect(errors.email).toBe('Invalid email')
  })
})
