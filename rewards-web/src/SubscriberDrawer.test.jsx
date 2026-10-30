import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  deliveries: [
    {
      id: 'delivery-1',
      milestone: 2,
      status: 'delivered',
    },
  ],
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
      id: 'delivery-1-old',
      milestone: 2,
      benefit: 'Cerveza doble de cortesía',
      status: 'reversed',
      recipientName: 'Captura anterior',
      deliveredAt: '2026-10-19T18:30:00.000Z',
      knownDate: true,
      deliveredByName: 'Personal de abonados',
      reversedAt: '2026-10-20T18:30:00.000Z',
      reversedByName: 'Supervisión',
      reversalReason: 'Nombre equivocado',
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

function errorResponse(error, status = 500) {
  return {
    ok: false,
    status,
    headers: { get: () => 'application/json' },
    json: async () => ({ error }),
  };
}

function liveDetail({
  program = ITEM,
  milestoneFourDelivery = null,
  redeemFromOffset = 0,
} = {}) {
  const deliveries = [
    {
      id: 'delivery-1',
      milestone: 2,
      status: 'delivered',
      recipientName: 'Familiar autorizado',
      deliveredAt: '2026-10-27T18:30:00.000Z',
      knownDate: true,
      deliveredByName: 'Personal de abonados',
    },
    ...(milestoneFourDelivery ? [milestoneFourDelivery] : []),
  ];
  return {
    program,
    rewards: [
      {
        milestone: 2,
        benefit: 'Cerveza doble de cortesía',
        status: 'delivered',
        delivery_id: 'delivery-1',
      },
      {
        milestone: 4,
        benefit: 'Dos cervezas Charros Brew',
        redeem_from_offset: redeemFromOffset,
        status: milestoneFourDelivery?.status || null,
        delivery_id: milestoneFourDelivery?.id || null,
      },
    ],
    deliveries,
    deliveryHistory: deliveries,
    seats: [{
      id: program.id,
      segment: program.segment,
      zone: program.zone,
      section: program.section,
      seat: program.seat,
      visits: program.visits,
    }],
    attendance: [],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SubscriberDrawer', () => {
  it('permite registrar una entrega al alcanzar el hito y conserva su estado dorado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'delivery-3' }));
    render(
      <SubscriberDrawer
        item={{ ...ITEM, visits: 4 }}
        live={false}
        onClose={() => {}}
      />,
    );

    const rewardButton = screen.getByRole('button', {
      name: /Visita 4:.*Hito alcanzado.*entrega disponible/i,
    });
    expect(rewardButton.disabled).toBe(false);
    expect(rewardButton.closest('.reward-step')?.classList.contains('earned')).toBe(true);

    fireEvent.click(rewardButton);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de quien recibe' }), {
      target: { value: 'Titular de prueba' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({
      milestone: 4,
      recipientName: 'Titular de prueba',
    });
  });

  it('respeta el desfase del catálogo al habilitar un hito dorado', async () => {
    const atMilestone = { ...ITEM, id: 'program-offset-1', visits: 4 };
    const afterMilestone = { ...ITEM, id: 'program-offset-2', visits: 5 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(liveDetail({
        program: atMilestone,
        redeemFromOffset: 1,
      })))
      .mockResolvedValueOnce(jsonResponse(liveDetail({
        program: afterMilestone,
        redeemFromOffset: 1,
      })));
    const view = render(<SubscriberDrawer item={atMilestone} live onClose={() => {}} />);

    const blockedReward = await screen.findByRole('button', {
      name: /Visita 4:.*entrega aún no habilitada/i,
    });
    expect(blockedReward.disabled).toBe(true);
    expect(blockedReward.closest('.reward-step')?.classList.contains('earned')).toBe(true);

    view.rerender(<SubscriberDrawer item={afterMilestone} live onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Visita 4:.*Disponible para entregar/i }).disabled)
        .toBe(false);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('muestra una sola versión vigente por recompensa y conserva la corrección más reciente', () => {
    render(<SubscriberDrawer item={ITEM} live={false} onClose={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Estado de entregas' })).toBeTruthy();
    expect(screen.getByText('Familiar autorizado')).toBeTruthy();
    expect(screen.queryByText('Captura anterior')).toBeNull();
    expect(screen.getByText('Destinatario no registrado')).toBeTruthy();
    expect(screen.getAllByText('Personal de abonados')).toHaveLength(2);
    expect(screen.getAllByText('Entrega corregida')).toHaveLength(2);
    expect(screen.getByText('Captura duplicada')).toBeTruthy();
    expect(screen.getByText(/Supervisión/)).toBeTruthy();
    expect(screen.getByText('Versión vigente después de 1 corrección.')).toBeTruthy();
    expect(document.querySelectorAll('.delivery-history > article')).toHaveLength(2);
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
    expect(JSON.parse(options.body)).toEqual({
      milestone: 4,
      recipientName: 'María Familiar',
      expectedLatestDeliveryId: 'delivery-2',
    });
    expect(options.headers['idempotency-key']).toBeTruthy();
    expect((await screen.findByRole('status')).textContent).toContain('Recompensa 4 entregada.');
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('corrige una entrega sin solicitar nuevamente el receptor', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => '' },
    });
    render(
      <SubscriberDrawer
        item={{
          ...ITEM,
          visits: 0,
          delivered_milestones: [2, 4],
          deliveries: [
            ...ITEM.deliveries,
            { id: 'delivery-4-active', milestone: 4, status: 'delivered' },
          ],
        }}
        live={false}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Visita 4:/ }));
    expect(screen.queryByRole('textbox', { name: 'Nombre de quien recibe' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desmarcar' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/api\/programs\/program-1\/deliveries\/4$/);
    expect(options.method).toBe('DELETE');
    expect(JSON.parse(options.body)).toEqual({
      reason: 'Corrección operativa desde el perfil del abonado',
      deliveryId: 'delivery-4-active',
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

  it('reutiliza la misma llave idempotente al reintentar desde el mismo modal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(errorResponse('Falla temporal'))
      .mockResolvedValueOnce(jsonResponse({ id: 'delivery-3' }));
    render(<SubscriberDrawer item={ITEM} live={false} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Visita 4:/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de quien recibe' }), {
      target: { value: 'Familiar autorizado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    expect(await screen.findByText('Falla temporal')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const firstKey = fetchSpy.mock.calls[0][1].headers['idempotency-key'];
    const secondKey = fetchSpy.mock.calls[1][1].headers['idempotency-key'];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
    expect((await screen.findByRole('status')).textContent).toContain('Recompensa 4 entregada.');
  });

  it('resincroniza un conflicto entre sesiones sin mostrar una confirmación falsa', async () => {
    const remoteDelivery = {
      id: 'delivery-4-remote',
      milestone: 4,
      status: 'delivered',
      recipientName: 'Persona registrada en otra sesión',
      deliveredAt: '2026-10-28T18:30:00.000Z',
      knownDate: true,
      deliveredByName: 'Otro usuario',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(liveDetail()))
      .mockResolvedValueOnce(errorResponse('La recompensa cambió', 409))
      .mockResolvedValueOnce(jsonResponse(liveDetail({ milestoneFourDelivery: remoteDelivery })));
    const onChanged = vi.fn();
    render(<SubscriberDrawer item={ITEM} live onClose={() => {}} onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: /Visita 4:/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de quien recibe' }), {
      target: { value: 'Captura local que no debe duplicarse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Otra sesión cambió esta recompensa');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Persona registrada en otra sesión')).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body).expectedLatestDeliveryId).toBeNull();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('actualiza en focus sin cerrar ni reiniciar el modal que se está capturando', async () => {
    const remoteDelivery = {
      id: 'delivery-4-remote',
      milestone: 4,
      status: 'delivered',
      recipientName: 'Registro remoto',
      deliveredAt: '2026-10-28T18:30:00.000Z',
      knownDate: true,
      deliveredByName: 'Otro usuario',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(liveDetail()))
      .mockResolvedValueOnce(jsonResponse(liveDetail({ milestoneFourDelivery: remoteDelivery })));
    render(<SubscriberDrawer item={ITEM} live onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: /Visita 4:/ }));
    const recipient = screen.getByRole('textbox', { name: 'Nombre de quien recibe' });
    fireEvent.change(recipient, { target: { value: 'Captura todavía en curso' } });
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Registro remoto')).toBeTruthy();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Nombre de quien recibe' }).value).toBe('Captura todavía en curso');
  });

  it('impide que una respuesta vieja sobrescriba el detalle de otra butaca', async () => {
    const secondItem = {
      ...ITEM,
      id: 'program-2',
      holder_name: 'Segundo abonado',
      holder_email: 'segundo@example.test',
      seat: 'A-2',
    };
    let resolveFirst;
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(jsonResponse(liveDetail({ program: secondItem })));
    const view = render(<SubscriberDrawer item={ITEM} live onClose={() => {}} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());

    view.rerender(<SubscriberDrawer item={secondItem} live onClose={() => {}} />);
    expect(await screen.findByText('segundo@example.test')).toBeTruthy();
    await act(async () => {
      resolveFirst(jsonResponse(liveDetail({
        program: { ...ITEM, holder_email: 'respuesta-vieja@example.test' },
      })));
      await Promise.resolve();
    });

    expect(screen.getByText('segundo@example.test')).toBeTruthy();
    expect(screen.queryByText('respuesta-vieja@example.test')).toBeNull();
  });

  it('no permite que focus aborte la actualización posterior a una entrega confirmada', async () => {
    const committedDelivery = {
      id: 'delivery-4-committed',
      milestone: 4,
      status: 'delivered',
      recipientName: 'Receptor confirmado',
      deliveredAt: '2026-10-28T18:30:00.000Z',
      knownDate: true,
      deliveredByName: 'Usuario actual',
    };
    let resolveRefresh;
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(liveDetail()))
      .mockResolvedValueOnce(jsonResponse({ id: 'delivery-4-committed' }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    const onChanged = vi.fn();
    render(<SubscriberDrawer item={ITEM} live onClose={() => {}} onChanged={onChanged} />);

    fireEvent.click(await screen.findByRole('button', { name: /Visita 4:/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de quien recibe' }), {
      target: { value: 'Receptor confirmado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, entregar' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    window.dispatchEvent(new Event('focus'));

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2][1].signal.aborted).toBe(false);
    await act(async () => {
      resolveRefresh(jsonResponse(liveDetail({ milestoneFourDelivery: committedDelivery })));
    });
    expect(await screen.findByText('Receptor confirmado')).toBeTruthy();
    expect((await screen.findByRole('status')).textContent).toContain('Recompensa 4 entregada.');
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
