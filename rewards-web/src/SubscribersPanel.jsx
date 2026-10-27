import React, { useDeferredValue, useEffect, useState } from 'react';
import { api } from './api.js';
import SubscriberDrawer from './SubscriberDrawer.jsx';
import { MILESTONES } from './rewards.js';

const SEGMENTS = ['VIP', 'PREFERENTE', 'GENERAL'];
const EMPTY_ITEMS = [];

function toggleValue(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function deliveredLabel(item) {
  const milestones = Array.isArray(item.delivered_milestones)
    ? item.delivered_milestones.map(Number).filter(Number.isFinite)
    : [];
  if (!milestones.length) return 'Sin recompensas entregadas';
  return `Entregadas: ${milestones.join(', ')}`;
}

export default function SubscribersPanel({ demo = false, demoItems = EMPTY_ITEMS, initialSelected = null }) {
  const [items, setItems] = useState(() => (demo ? demoItems : []));
  const [total, setTotal] = useState(() => (demo ? demoItems.length : 0));
  const [selected, setSelected] = useState(initialSelected);
  const [query, setQuery] = useState('');
  const [segments, setSegments] = useState([]);
  const [redeemed, setRedeemed] = useState([]);
  const [minVisits, setMinVisits] = useState('0');
  const [maxVisits, setMaxVisits] = useState('34');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState('');
  const deferredQuery = useDeferredValue(query);
  const segmentKey = segments.join(',');
  const redeemedKey = redeemed.join(',');

  useEffect(() => {
    if (demo) {
      setItems(demoItems);
      setTotal(demoItems.length);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      q: deferredQuery.trim(),
      minVisits: minVisits || '0',
      maxVisits: maxVisits || '34',
    });
    if (segmentKey) params.set('segments', segmentKey);
    if (redeemedKey) params.set('redeemed', redeemedKey);

    setLoading(true);
    setError('');
    api(`/api/programs?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        const nextItems = response.items || [];
        setItems(nextItems);
        setTotal(response.total ?? nextItems.length);
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [demo, demoItems, deferredQuery, maxVisits, minVisits, redeemedKey, refreshKey, segmentKey]);

  const clearFilters = () => {
    setQuery('');
    setSegments([]);
    setRedeemed([]);
    setMinVisits('0');
    setMaxVisits('34');
  };

  const hasFilters = Boolean(query || segments.length || redeemed.length || minVisits !== '0' || maxVisits !== '34');

  return (
    <section className="panel subscribers-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">PADRÓN OPERATIVO</p>
          <h2>Buscar y filtrar abonados</h2>
        </div>
        <span>{loading ? 'Actualizando…' : `${total} resultados`}</span>
      </div>

      <div className="filters">
        <label className="search-field">
          <span className="sr-only">Buscar abonado</span>
          <input
            className="search"
            type="search"
            placeholder="Nombre, correo, teléfono, orden o ubicación…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Mín. visitas
          <input
            type="number"
            min="0"
            max="34"
            value={minVisits}
            onChange={(event) => setMinVisits(event.target.value)}
          />
        </label>
        <label>
          Máx. visitas
          <input
            type="number"
            min="0"
            max="34"
            value={maxVisits}
            onChange={(event) => setMaxVisits(event.target.value)}
          />
        </label>
        {hasFilters ? <button type="button" className="clear-filters" onClick={clearFilters}>Limpiar filtros</button> : null}
      </div>

      <fieldset className="filter-group">
        <legend>Segmentos <small>Se acumulan entre sí</small></legend>
        <div className="filter-chips">
          {SEGMENTS.map((segment) => (
            <button
              type="button"
              key={segment}
              className={segments.includes(segment) ? 'selected' : ''}
              aria-pressed={segments.includes(segment)}
              onClick={() => setSegments((current) => toggleValue(current, segment))}
            >
              {segment === 'PREFERENTE' ? 'Preferente' : segment === 'GENERAL' ? 'General' : 'VIP'}
            </button>
          ))}
        </div>
      </fieldset>

      <details className="reward-filter">
        <summary>
          Recompensas entregadas
          <span>{redeemed.length ? `${redeemed.length} seleccionadas` : 'Todas'}</span>
        </summary>
        <fieldset className="filter-group">
          <legend>Selecciona una o varias <small>Los resultados coinciden con cualquiera</small></legend>
          <div className="filter-chips milestones">
            {MILESTONES.map((milestone) => (
              <button
                type="button"
                key={milestone}
                className={redeemed.includes(milestone) ? 'selected' : ''}
                aria-pressed={redeemed.includes(milestone)}
                onClick={() => setRedeemed((current) => toggleValue(current, milestone))}
              >
                {milestone}
              </button>
            ))}
          </div>
        </fieldset>
      </details>

      {error ? <div className="error" role="alert">⚠ {error}</div> : null}
      <div className={`table subscriber-table ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
        {items.map((item) => (
          <button className="row" type="button" key={item.id} onClick={() => setSelected(item)}>
            <span>
              <b>{item.holder_name}</b>
              <small>{item.holder_email || item.holder_phone || `Orden ${item.order_number}`}</small>
            </span>
            <span>
              <b>{item.segment || item.zone}</b>
              <small>{item.zone} · {item.section} · {item.seat}</small>
            </span>
            <strong>{item.visits} visitas</strong>
            <span className="delivery-summary">
              <small>{deliveredLabel(item)}</small>
              <i>Ver perfil →</i>
            </span>
          </button>
        ))}
        {!loading && !items.length ? (
          <div className="empty">No encontramos abonados con estos filtros.</div>
        ) : null}
      </div>

      {selected ? (
        <SubscriberDrawer
          item={selected}
          live={!demo}
          onClose={() => setSelected(null)}
          onChanged={() => setRefreshKey((current) => current + 1)}
        />
      ) : null}
    </section>
  );
}
