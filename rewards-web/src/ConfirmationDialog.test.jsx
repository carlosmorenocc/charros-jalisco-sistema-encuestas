import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmationDialog from './ConfirmationDialog.jsx';

afterEach(cleanup);

describe('ConfirmationDialog', () => {
  it('mantiene el foco dentro y permite cancelar con Escape', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmationDialog
        action="deliver"
        reward={{ milestone: 4, benefit: 'Beneficio de prueba' }}
        busy={false}
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    );

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Sí, entregar' });
    expect(document.activeElement).toBe(cancel);

    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
