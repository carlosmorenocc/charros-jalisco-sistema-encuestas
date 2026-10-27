import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('vista demostrativa', () => {
  it('permanece local al consultar y simular una importación', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    await waitFor(() => expect(screen.getByText(/no se guardó información/i)).toBeTruthy());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
