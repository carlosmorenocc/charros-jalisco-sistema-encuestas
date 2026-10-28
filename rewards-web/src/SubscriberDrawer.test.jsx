import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SubscriberDrawer from './SubscriberDrawer.jsx';

const ITEM = {
  id: 'program-1',
  holder_name: 'Abonado de prueba',
  order_number: '10001',
  segment: 'GENERAL',
  zone: 'Planta Alta Central',
  section: '410-S1',
  seat: 'A-1',
  visits: 5,
  delivered_milestones: [2],
  deliveryHistory: [
    {
      id: 'delivery-1',
      milestone: 2,
      benefit: 'Cerveza doble de cortesía',
      status: 'delivered',
      recipientName: 'Familiar autorizado',
      deliveredAt: '2026-10-27T18:30:00.000Z',
      knownDate: true,
      deliveredByName: 'Personal de abonados',
    },
    {
      id: 'delivery-2',
      milestone: 4,
      benefit: 'Dos cervezas Charros Brew',
      status: 'reversed',
      recipientName: null,
      deliveredAt: '2026-10-20T18:30:00.000Z',
      knownDate: true,
      deliveredByName: 'Personal de abonados',
      reversedAt: '2026-10-21T18:30:00.000Z',
      reversedByName: 'Supervisión',
      reversalReason: 'Captura duplicada',
    },
  ],
};

function jsonResponse(data = {}) {
  return {
    ok: true,
    status: 201,
    headers: { get: () => 'application/json' },
    json: async () => data,
  };
}

function errorResponse(error) {
  return {
    ok: false,
    status: 500,
    headers: { get: () => 'application/json' },
    json: async () => ({ error }),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SubscriberDrawer', () => {
  it('muestra el historial completo, incluidos registros anteriores y correcciones', () => {
    render(<SubscriberDrawer item={ITEM} live={false} onClose={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Historial de entregas' })).toBeTruthy();
    expect(screen.getByText('Familiar autorizado')).toBeTruthy();
    expect(screen.getByText('Destinatario no registrado')).toBeTruthy();
    expect(screen.getAllByText('Personal de abonados')).toHaveLength(2);
    expect(screen.getAllByText('Entrega corregida')).toHaveLength(2);
    expect(screen.getByText('Captura duplicada')).toBeTruthy();
    expect(screen.getByText(/Supervisión/)).toBeTruthy();
  });

  it('envía el nombre del receptor al registrar una entrega y muestra un aviso breve', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'delivery-3' }));
    const onChanged = vi.fn();
    render(<SubscriberDrawer item={ITEM} live={false} onClose={() => {}} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: /Visita 4:/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de quien recibe' }), {
      target: { value: 'María Familiar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/api\/programs\/program-1\/deliveries$/);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ milestone: 4, recipientName: 'María Familiar' });
    expect((await screen.findByRole('status')).textContent).toContain('Recompensa 4 entregada.');
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('corrige una entrega sin solicitar nuevamente el receptor', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => '' },
    });
    render(<SubscriberDrawer item={{ ...ITEM, delivered_milestones: [2, 4] }} live={false} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Visita 4:/ }));
    expect(screen.queryByRole('textbox', { name: 'Nombre de quien recibe' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desmarcar' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/api\/programs\/program-1\/deliveries\/4$/);
    expect(options.method).toBe('DELETE');
    expect(JSON.parse(options.body)).toEqual({
      reason: 'Corrección operativa desde el perfil del abonado',
    });
  });

  it('conserva abierto y editable el formulario si el API rechaza la entrega', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse('No se pudo registrar la entrega'));
    render(<SubscriberDrawer item={ITEM} live={false} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Visita 4:/ }));
    const recipient = screen.getByRole('textbox', { name: 'Nombre de quien recibe' });
    fireEvent.change(recipient, { target: { value: 'Familiar autorizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'No se pudo registrar la entrega');
    expect(screen.getByRole('textbox', { name: 'Nombre de quien recibe' }).value).toBe('Familiar autorizado');
    expect(screen.getByRole('button', { name: 'Sí, entregar' }).disabled).toBe(false);
  });
});
