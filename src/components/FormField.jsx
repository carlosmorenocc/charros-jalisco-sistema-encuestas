import React, { useState } from 'react'
import { validateField } from '../utils/validation'

export default function FormField({
  type = 'text',
  name,
  label,
  value,
  onChange,
  onBlur,
  validations,
  placeholder,
  options,
  required = false,
  maxLength = 1000
}) {
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const newValue = e.target.value
    onChange({ [name]: newValue })

    // Real-time validation if field was touched
    if (touched && validations) {
      const err = validateField(name, newValue, { [name]: validations })
      setError(err || '')
    }
  }

  const handleBlur = () => {
    setTouched(true)
    if (validations) {
      const err = validateField(name, value, { [name]: validations })
      setError(err || '')
    }
    if (onBlur) onBlur()
  }

  const isInvalid = touched && error

  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={name} style={{ display: 'block', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: 'var(--red)' }}> *</span>}
      </label>

      {type === 'textarea' ? (
        <textarea
          id={name}
          name={name}
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={4}
          aria-invalid={isInvalid}
          style={{
            borderColor: isInvalid ? 'var(--red)' : undefined
          }}
        />
      ) : type === 'select' ? (
        <select
          id={name}
          name={name}
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={isInvalid}
          style={{
            borderColor: isInvalid ? 'var(--red)' : undefined
          }}
        >
          <option value="">-- Selecciona --</option>
          {options && options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          type={type}
          name={name}
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-invalid={isInvalid}
          style={{
            borderColor: isInvalid ? 'var(--red)' : undefined
          }}
        />
      )}

      {isInvalid && <div className="error-message">{error}</div>}
    </div>
  )
}
