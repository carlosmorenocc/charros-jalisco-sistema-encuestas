import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FormField from '../components/FormField'

describe('FormField', () => {
  it('renders a text input by default', () => {
    render(
      <FormField
        name="test"
        label="Test Label"
        value=""
        onChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/Test Label/)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text')
  })

  it('renders a select input when type is select', () => {
    render(
      <FormField
        name="test"
        label="Select"
        type="select"
        value=""
        onChange={vi.fn()}
        options={['Option 1', 'Option 2']}
      />
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('calls onChange when value changes', () => {
    const onChange = vi.fn()
    render(
      <FormField
        name="test"
        label="Test"
        value=""
        onChange={onChange}
      />
    )
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'new value' } })
    expect(onChange).toHaveBeenCalledWith({ test: 'new value' })
  })

  it('displays error message when invalid and touched', () => {
    const validations = [{ rule: 'required', message: 'This field is required' }]
    const { rerender } = render(
      <FormField
        name="test"
        label="Test"
        value=""
        onChange={vi.fn()}
        validations={validations}
      />
    )
    const input = screen.getByRole('textbox')
    fireEvent.blur(input)
    
    // Re-render to show error after validation
    rerender(
      <FormField
        name="test"
        label="Test"
        value=""
        onChange={vi.fn()}
        validations={validations}
      />
    )
    
    expect(screen.getByText(/This field is required/)).toBeInTheDocument()
  })

  it('shows required asterisk when required prop is true', () => {
    render(
      <FormField
        name="test"
        label="Test"
        value=""
        onChange={vi.fn()}
        required={true}
      />
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })
})
