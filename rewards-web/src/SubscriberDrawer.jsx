import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import ConfirmationDialog from './ConfirmationDialog.jsx';
import { DEFAULT_REWARDS, getRewardState } from './rewards.js';

const CORRECTION_REASON = 'Corrección operativa desde el perfil del abonado';

function rewardStatusLabel(state) {
  if (state === 'delivered') return 'Entregada';
  if (state === 'available') return 'Disponible para entregar';
  if (state === 'earned') return 'Hito alcanzado · disponible en la siguiente visita';
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

  const loadDetail = async (programId, signal) => {
    const response = await api(`/api/programs/${programId}`, { signal });
    setDetail(response);
    return response;
  };

  useEffect(() => {
    setCurrentId(item.id);
  }, [item.id]);

  useEffect(() => {
    if (!live) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setDetail(null);
    setError('');
    setNotice('');
    loadDetail(currentId, controller.signal)
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [currentId, live]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !confirmation) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [confirmation, onClose]);

  const program = detail?.program || item;
  const deliveredDemoMilestones = new Set(item.delivered_milestones || []);
  const rewards = detail?.rewards || DEFAULT_REWARDS.map((reward) => ({
    ...reward,
    status: deliveredDemoMilestones.has(reward.milestone) ? 'delivered' : null,
  }));
  const visits = Number(program.visits || 0);
  const segment = program.segment || program.zone || 'Sin segmento';
  const deliveryHistory = [...(
    detail?.deliveryHistory
    || detail?.deliveries
    || item.deliveryHistory
    || item.deliveries
    || []
  )]
    .sort((left, right) => {
      const rightDate = new Date(right.reversedAt || right.deliveredAt || 0).getTime() || 0;
      const leftDate = new Date(left.reversedAt || left.deliveredAt || 0).getTime() || 0;
      return rightDate - leftDate || Number(right.milestone) - Number(left.milestone);
    });

  const openConfirmation = (action, reward) => {
    setConfirmationError('');
    setConfirmation({ action, reward });
  };

  const closeConfirmation = () => {
    setConfirmationError('');
    setConfirmation(null);
  };

  const confirmRewardChange = async (recipientName) => {
    const { action, reward } = confirmation;
    setBusy(true);
    setError('');
    setConfirmationError('');
    try {
      if (action === 'undo') {
        await api(`/api/programs/${program.id}/deliveries/${reward.milestone}`, {
          method: 'DELETE',
          body: { reason: CORRECTION_REASON },
        });
        setNotice(`Recompensa ${reward.milestone} corregida.`);
      } else {
        await api(`/api/programs/${program.id}/deliveries`, {
          method: 'POST',
          body: { milestone: reward.milestone, recipientName },
        });
        setNotice(`Recompensa ${reward.milestone} entregada.`);
      }
      setConfirmation(null);
      if (live) await loadDetail(program.id);
      onChanged?.();
    } catch (reason) {
      setConfirmationError(reason.message || 'No pudimos guardar la entrega. Intenta nuevamente.');
    } finally {
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
            <p className="hint">Cada recompensa se habilita en la asistencia posterior al hito.</p>
          </div>
          <div className="reward-legend" aria-label="Estados de recompensas">
            <span><i className="legend-dot available" />Disponible</span>
            <span><i className="legend-dot delivered" />Entregada</span>
          </div>
        </div>

        <div className="reward-track">
          {rewards.map((reward) => {
            const state = getRewardState(reward, visits);
            const disabled = state === 'pending' || state === 'earned';
            const title = `${reward.benefit}. ${rewardStatusLabel(state)}.`;
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
                <small>{rewardStatusLabel(state)}</small>
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
            <h3>Historial de entregas</h3>
            <p className="hint">Registro de recompensas entregadas y correcciones, con las más recientes primero.</p>
          </div>
        </div>
        <div className="delivery-history">
          {deliveryHistory.length ? deliveryHistory.map((delivery) => {
            const reward = rewards.find(({ milestone }) => Number(milestone) === Number(delivery.milestone));
            const benefit = delivery.benefit || reward?.benefit || 'Beneficio no especificado';
            const reversed = delivery.status === 'reversed';
            return (
              <article className={reversed ? 'reversed' : ''} key={delivery.id || `${delivery.milestone}-${delivery.deliveredAt || 'legacy'}`}>
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
