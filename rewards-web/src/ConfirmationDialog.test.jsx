import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmationDialog from './ConfirmationDialog.jsx';

afterEach(cleanup);

describe('ConfirmationDialog', () => {
  it('enfoca el nombre, mantiene el foco dentro y permite cancelar con Escape', () => {
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

    const recipient = screen.getByRole('textbox', { name: 'Nombre de quien recibe' });
    const confirm = screen.getByRole('button', { name: 'Sí, entregar' });
    expect(document.activeElement).toBe(recipient);

    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(recipient);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('exige el receptor y entrega el nombre normalizado sin pedir una fecha', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        action="deliver"
        reward={{ milestone: 4, benefit: 'Dos cervezas Charros Brew' }}
        busy={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    const recipient = screen.getByRole('textbox', { name: 'Nombre de quien recibe' });
    expect(screen.getByText('Dos cervezas Charros Brew')).toBeTruthy();
    expect(document.querySelector('input[type="date"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/indica el nombre/i);

    fireEvent.change(recipient, { target: { value: '  Ana López  ' } });
    fireEvent.submit(recipient.closest('form'));
    expect(onConfirm).toHaveBeenCalledWith('Ana López');
  });

  it('mantiene la corrección como confirmación sin capturar receptor', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        action="undo"
        reward={{ milestone: 4, benefit: 'Beneficio de prueba' }}
        busy={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desmarcar' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
