import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('vista demostrativa', () => {
  it('explica la conciliación y bloquea una importación con filas por revisar', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    window.history.replaceState({}, '', '/?demo=1&page=import');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Importar asistencias' })).toBeTruthy();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'demo-game-1' } });
    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [new File(['demo'], 'asistencias.xlsx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Previsualizar' }));

    expect(await screen.findByRole('heading', { name: 'Resultado antes de escribir' })).toBeTruthy();
    expect(screen.getByText('Coincidencia exacta')).toBeTruthy();
    expect(screen.getByText('Equivalencia de zona')).toBeTruthy();
    expect(screen.getByText('Orden y butaca única')).toBeTruthy();
    expect(screen.getByText(/3 filas requieren revisión/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar importación' }).disabled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
