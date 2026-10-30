import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import ConfirmationDialog from './ConfirmationDialog.jsx';
import { canDeliverReward, DEFAULT_REWARDS, getRewardState } from './rewards.js';

const CORRECTION_REASON = 'Corrección operativa desde el perfil del abonado';
const BACKGROUND_REFRESH_MS = 15_000;
const CONCURRENT_CHANGE_STATUSES = new Set([404, 409]);

function deliveryChangedAt(delivery) {
  const value = delivery.lastChangedAt
    || delivery.reversedAt
    || delivery.deliveredAt
    || delivery.createdAt;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getCurrentDeliveryHistory(deliveries = []) {
  const grouped = new Map();

  deliveries.forEach((delivery, index) => {
    const key = String(delivery.milestone);
    const group = grouped.get(key) || { current: null, total: 0, corrections: 0 };
    const current = group.current;
    const reversed = delivery.status === 'reversed';
    const candidate = { delivery, index, timestamp: deliveryChangedAt(delivery), reversed };
    group.total += 1;
    if (reversed) group.corrections += 1;

    if (!current
      || (current.reversed && !reversed)
      || (current.reversed === reversed && candidate.timestamp > current.timestamp)
      || (current.reversed === reversed
        && candidate.timestamp === current.timestamp
        && index < current.index)) {
      group.current = candidate;
    }
    grouped.set(key, group);
  });

  return [...grouped.values()]
    .map(({ current, total, corrections }) => ({
      ...current.delivery,
      versionCount: current.delivery.versionCount ?? total,
      correctionCount: current.delivery.correctionCount ?? corrections,
    }))
    .sort((left, right) => (
      deliveryChangedAt(right) - deliveryChangedAt(left)
      || Number(right.milestone) - Number(left.milestone)
    ));
}

function deliverySignature(detail) {
  const deliveries = getCurrentDeliveryHistory(detail?.deliveryHistory || detail?.deliveries || []);
  return JSON.stringify(deliveries.map((delivery) => [
    delivery.milestone,
    delivery.id,
    delivery.status,
    delivery.lastChangedAt,
    delivery.reversedAt,
    delivery.deliveredAt,
    delivery.recipientName,
  ]));
}

function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function rewardStatusLabel(state, deliverable = false) {
  if (state === 'delivered') return 'Entregada';
  if (state === 'available') return 'Disponible para entregar';
  if (state === 'earned') {
    return deliverable
      ? 'Hito alcanzado · entrega disponible'
      : 'Hito alcanzado · entrega aún no habilitada';
  }
  return 'Pendiente';
}

function deliveryStatusLabel(status) {
  if (status === 'reversed') return 'Entrega corregida';
  if (status === 'historical_unreviewed') return 'Registro histórico';
  return 'Entregada';
}

function formatDeliveryDate(value, knownDate = true) {
  if (!knownDate || !value) return 'Fecha no disponible';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SubscriberDrawer({ item, live = true, onClose, onChanged }) {
  const [currentId, setCurrentId] = useState(item.id);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(live);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationError, setConfirmationError] = useState('');
  const [busy, setBusy] = useState(false);
  const detailRef = useRef(null);
  const currentIdRef = useRef(item.id);
  const requestRef = useRef({ controller: null, sequence: 0, programId: item.id, priority: null });
  const busyRef = useRef(false);

  const loadDetail = useCallback(async (
    programId,
    { announceChange = false, priority = 'foreground' } = {},
  ) => {
    if (priority === 'background'
      && requestRef.current.controller
      && requestRef.current.priority === 'foreground') {
      return null;
    }
    requestRef.current.controller?.abort();
    const controller = new AbortController();
    const sequence = requestRef.current.sequence + 1;
    requestRef.current = { controller, sequence, programId, priority };
    const previousDetail = detailRef.current;

    try {
      const response = await api(`/api/programs/${programId}`, { signal: controller.signal });
      const isCurrent = !controller.signal.aborted
        && requestRef.current.sequence === sequence
        && currentIdRef.current === programId;
      if (!isCurrent) return null;

      detailRef.current = response;
      setDetail(response);
      setError('');
      if (announceChange
        && previousDetail
        && deliverySignature(previousDetail) !== deliverySignature(response)) {
        setNotice((current) => current || 'Otra sesión actualizó las entregas. Mostramos la versión vigente.');
      }
      return response;
    } finally {
      if (requestRef.current.sequence === sequence) {
        requestRef.current.controller = null;
        requestRef.current.priority = null;
        if (currentIdRef.current === programId) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setCurrentId(item.id);
  }, [item.id]);

  useEffect(() => {
    if (!live) {
      setLoading(false);
      return undefined;
    }

    currentIdRef.current = currentId;
    requestRef.current.controller?.abort();
    detailRef.current = null;
    setLoading(true);
    setDetail(null);
    setError('');
    setNotice('');
    setConfirmation(null);
    setConfirmationError('');
    loadDetail(currentId)
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => {
      if (requestRef.current.programId === currentId) requestRef.current.controller?.abort();
    };
  }, [currentId, live, loadDetail]);

  useEffect(() => {
    if (!live) return undefined;

    let lastRefreshAt = 0;
    const refresh = () => {
      if (document.visibilityState !== 'visible' || busyRef.current) return;
      const now = Date.now();
      if (now - lastRefreshAt < 1_000) return;
      lastRefreshAt = now;
      loadDetail(currentId, { announceChange: true, priority: 'background' }).catch((reason) => {
        if (reason.name !== 'AbortError' && !detailRef.current) setError(reason.message);
      });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = window.setInterval(refresh, BACKGROUND_REFRESH_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [currentId, live, loadDetail]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !confirmation) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirmation, onClose]);

  const program = detail?.program || item;
  const detailIsCurrent = !live || detail?.program?.id === currentId;
  const deliveredDemoMilestones = new Set(item.delivered_milestones || []);
  const fallbackDeliveries = item.deliveries || [];
  const rewards = detail?.rewards || DEFAULT_REWARDS.map((reward) => ({
    ...reward,
    status: deliveredDemoMilestones.has(reward.milestone) ? 'delivered' : null,
    delivery_id: fallbackDeliveries.find(
      (delivery) => Number(delivery.milestone) === Number(reward.milestone)
        && delivery.status !== 'reversed',
    )?.id || null,
  }));
  const visits = Number(program.visits || 0);
  const segment = program.segment || program.zone || 'Sin segmento';
  const deliveryHistory = getCurrentDeliveryHistory([
    ...(
    detail?.deliveryHistory
    || detail?.deliveries
    || item.deliveryHistory
    || item.deliveries
    || []
    ),
  ]);

  const openConfirmation = (action, reward) => {
    const activeDelivery = (detail?.deliveries || item.deliveries || []).find(
      (delivery) => Number(delivery.milestone) === Number(reward.milestone)
        && delivery.status !== 'reversed',
    );
    const latestDelivery = deliveryHistory.find(
      (delivery) => Number(delivery.milestone) === Number(reward.milestone),
    );
    setConfirmationError('');
    setConfirmation({
      action,
      reward,
      deliveryId: reward.delivery_id || reward.deliveryId || activeDelivery?.id || null,
      expectedLatestDeliveryId: latestDelivery?.id || null,
      idempotencyKey: action === 'deliver' ? createIdempotencyKey() : null,
    });
  };

  const closeConfirmation = () => {
    setConfirmationError('');
    setConfirmation(null);
  };

  const confirmRewardChange = async (recipientName) => {
    const {
      action,
      reward,
      deliveryId,
      expectedLatestDeliveryId,
      idempotencyKey,
    } = confirmation;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setConfirmationError('');
    try {
      try {
        if (action === 'undo') {
          if (!deliveryId) {
            throw new Error('No pudimos identificar la versión activa. Cierra y vuelve a abrir la recompensa.');
          }
          await api(`/api/programs/${program.id}/deliveries/${reward.milestone}`, {
            method: 'DELETE',
            body: { reason: CORRECTION_REASON, deliveryId },
          });
        } else {
          await api(`/api/programs/${program.id}/deliveries`, {
            method: 'POST',
            body: { milestone: reward.milestone, recipientName, expectedLatestDeliveryId },
            headers: { 'idempotency-key': idempotencyKey },
          });
        }
      } catch (reason) {
        if (live && CONCURRENT_CHANGE_STATUSES.has(reason.status)) {
          try {
            await loadDetail(program.id);
            setConfirmation(null);
            setNotice('Otra sesión cambió esta recompensa. Actualizamos el estado vigente y no duplicamos tu operación.');
            onChanged?.();
          } catch (refreshError) {
            setConfirmationError(
              refreshError.name === 'AbortError'
                ? 'La recompensa cambió en otra sesión. Vuelve a intentarlo cuando termine la sincronización.'
                : 'La recompensa cambió en otra sesión, pero no pudimos actualizar la vista. Cierra y vuelve a abrir el perfil.',
            );
          }
        } else {
          setConfirmationError(reason.message || 'No pudimos guardar la entrega. Intenta nuevamente.');
        }
        return;
      }

      setConfirmation(null);
      setNotice(
        action === 'undo'
          ? `Recompensa ${reward.milestone} corregida.`
          : `Recompensa ${reward.milestone} entregada.`,
      );
      onChanged?.();
      if (live) {
        try {
          await loadDetail(program.id);
        } catch (refreshError) {
          if (refreshError.name !== 'AbortError') {
            setError('La entrega sí se guardó, pero no pudimos actualizar la vista. Vuelve a abrir el perfil para verificarla.');
          }
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil de ${program.holder_name}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="close" type="button" aria-label="Cerrar perfil" onClick={onClose}>×</button>
        <p className="eyebrow">PERFIL DEL ABONADO</p>
        <h2>{program.holder_name}</h2>

        {loading ? <div className="loading-panel">Cargando información…</div> : null}
        {error ? <div className="error" role="alert">⚠ {error}</div> : null}
        {notice ? <div className="success" role="status">{notice}</div> : null}

        <dl className="buyer-details">
          <div><dt>Orden</dt><dd>{program.order_number || 'Sin dato'}</dd></div>
          <div><dt>Correo</dt><dd>{program.holder_email || 'Sin correo registrado'}</dd></div>
          <div><dt>Teléfono</dt><dd>{program.holder_phone || 'Sin teléfono registrado'}</dd></div>
          <div><dt>Segmento</dt><dd>{segment}</dd></div>
        </dl>

        {detail?.seats?.length > 1 ? (
          <div className="seat-selector" aria-label="Butacas de la compra">
            {detail.seats.map((seat) => (
              <button
                type="button"
                className={seat.id === program.id ? 'active' : ''}
                key={seat.id}
                onClick={() => setCurrentId(seat.id)}
              >
                <b>{seat.section} · {seat.seat}</b>
                <span>{seat.segment || seat.zone}</span>
                <small>{seat.visits} visitas</small>
              </button>
            ))}
          </div>
        ) : null}

        <div className="seat">
          <div><small>Zona</small><b>{program.zone || segment}</b></div>
          <div><small>Butaca</small><span>{program.section} · {program.seat}</span></div>
          <strong>{visits}<small> visitas</small></strong>
        </div>

        <div className="reward-heading">
          <div>
            <h3>Ruta de recompensas</h3>
            <p className="hint">
              Al alcanzar el hito, el círculo dorado queda habilitado para registrar la entrega.
              {' '}El siguiente acceso se sumará cuando se cargue el reporte del partido.
            </p>
          </div>
          <div className="reward-legend" aria-label="Estados de recompensas">
            <span><i className="legend-dot available" />Disponible</span>
            <span><i className="legend-dot delivered" />Entregada</span>
          </div>
        </div>

        <div className="reward-track" aria-busy={live && !detailIsCurrent}>
          {rewards.map((reward) => {
            const state = getRewardState(reward, visits);
            const deliverable = canDeliverReward(reward, visits);
            const disabled = (state !== 'delivered' && !deliverable) || !detailIsCurrent;
            const statusLabel = rewardStatusLabel(state, deliverable);
            const title = `${reward.benefit}. ${statusLabel}.`;
            return (
              <div className={`reward-step ${state}`} key={reward.milestone}>
                <button
                  type="button"
                  title={title}
                  aria-label={`Visita ${reward.milestone}: ${title}`}
                  aria-pressed={state === 'delivered'}
                  disabled={disabled}
                  onClick={() => openConfirmation(state === 'delivered' ? 'undo' : 'deliver', reward)}
                >
                  {reward.milestone}
                </button>
                <strong>{reward.benefit}</strong>
                <small>{statusLabel}</small>
              </div>
            );
          })}
        </div>

        <h3>Historial de asistencia</h3>
        <div className="attendance-history">
          {detail?.attendance?.length ? detail.attendance.map((game) => (
            <article key={game.sequence_number}>
              <b>✓ Juego {game.sequence_number}</b>
              <span>{game.display_name}</span>
              <small>{new Date(game.scanned_at).toLocaleString('es-MX')}</small>
            </article>
          )) : <div className="empty">Sin asistencias comprobadas.</div>}
        </div>

        <div className="history-heading">
          <div>
            <h3>Estado de entregas</h3>
            <p className="hint">Una tarjeta vigente por recompensa, siempre con su última versión.</p>
          </div>
        </div>
        <div className="delivery-history">
          {deliveryHistory.length ? deliveryHistory.map((delivery) => {
            const reward = rewards.find(({ milestone }) => Number(milestone) === Number(delivery.milestone));
            const benefit = delivery.benefit || reward?.benefit || 'Beneficio no especificado';
            const reversed = delivery.status === 'reversed';
            const correctionCount = Number(delivery.correctionCount || 0);
            return (
              <article className={reversed ? 'reversed' : ''} key={delivery.milestone}>
                <header>
                  <div>
                    <small>RECOMPENSA</small>
                    <b>Número {delivery.milestone}</b>
                  </div>
                  <span className={`delivery-status ${reversed ? 'reversed' : 'delivered'}`}>
                    {deliveryStatusLabel(delivery.status)}
                  </span>
                </header>
                <strong className="delivery-benefit">{benefit}</strong>
                <dl>
                  <div>
                    <dt>Entregada</dt>
                    <dd>{formatDeliveryDate(delivery.deliveredAt, delivery.knownDate)}</dd>
                  </div>
                  <div>
                    <dt>Recibió</dt>
                    <dd>{delivery.recipientName || 'Destinatario no registrado'}</dd>
                  </div>
                  <div>
                    <dt>Registró</dt>
                    <dd>{delivery.deliveredByName || 'Personal autorizado'}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>{deliveryStatusLabel(delivery.status)}</dd>
                  </div>
                </dl>
                {reversed ? (
                  <div className="delivery-correction">
                    <b>Corrección registrada</b>
                    <span>
                      {formatDeliveryDate(delivery.reversedAt)} · {delivery.reversedByName || 'Personal autorizado'}
                    </span>
                    {delivery.reversalReason ? <small>{delivery.reversalReason}</small> : null}
                  </div>
                ) : null}
                {!reversed && correctionCount ? (
                  <p className="delivery-version-note">
                    Versión vigente después de {correctionCount} {correctionCount === 1 ? 'corrección' : 'correcciones'}.
                  </p>
                ) : null}
              </article>
            );
          }) : <div className="empty">Aún no hay recompensas entregadas para esta butaca.</div>}
        </div>

        <ConfirmationDialog
          action={confirmation?.action}
          reward={confirmation?.reward}
          busy={busy}
          error={confirmationError}
          onCancel={closeConfirmation}
          onConfirm={confirmRewardChange}
        />
      </aside>
    </div>
  );
}
