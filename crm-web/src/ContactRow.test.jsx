import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ContactRow } from './App';

const contact = { id: 'contact-1', name: 'Cliente por renovar', type: 'Por renovar', executive: 'Sin asignar' };
function row(props = {}) {
  return render(<table><tbody><ContactRow contact={contact} onEdit={vi.fn()} {...props} /></tbody></table>);
}

it('el menú abre la confirmación de eliminación sin eliminar directamente', () => {
  const onEdit = vi.fn();
  row({ mayDelete: true, onEdit });
  fireEvent.click(screen.getByLabelText(`Abrir vistas de ${contact.name}`));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar contacto' }));
  expect(onEdit).toHaveBeenCalledWith(contact, { initialPanel: 'contact', confirmDelete: true });
  expect(document.querySelector('details')).not.toHaveAttribute('open');
});

it('no ofrece eliminar sin permiso', () => {
  row();
  expect(screen.queryByText('Eliminar contacto')).not.toBeInTheDocument();
});

it('no ofrece eliminar otra vez un contacto ya eliminado', () => {
  row({ mayDelete: true, contact: { ...contact, deletedAt: '2026-09-17T12:00:00Z' } });
  expect(screen.queryByText('Eliminar contacto')).not.toBeInTheDocument();
});
