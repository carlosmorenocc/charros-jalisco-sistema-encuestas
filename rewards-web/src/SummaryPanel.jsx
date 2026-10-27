import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const DEMO_SUMMARY = {
  programs: 3,
  visits: 9,
  processedGames: 4,
  deliveries: 1,
  distribution: [
    { visits: 2, total: 1 },
    { visits: 3, total: 1 },
    { visits: 4, total: 1 },
  ],
};

export default function SummaryPanel({ demo = false }) {
  const [summary, setSummary] = useState(() => (demo ? DEMO_SUMMARY : null));
  const [error, setError] = useState('');

  useEffect(() => {
    if (demo) return undefined;
    const controller = new AbortController();
    api('/api/summary', { signal: controller.signal })
      .then(setSummary)
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [demo]);

  if (error) return <div className="error panel" role="alert">⚠ {error}</div>;
  if (!summary) return <section className="panel loading-panel">Cargando resumen…</section>;

  const distribution = summary.distribution || [];
  const maxBar = Math.max(...distribution.map((item) => item.total), 1);

  return (
    <>
      <section className="metrics" aria-label="Resumen del programa">
        <article>
          <span>Butacas participantes</span>
          <b>{summary.programs}</b>
          <small>programas independientes</small>
        </article>
        <article>
          <span>Asistencias comprobadas</span>
          <b>{summary.visits}</b>
          <small>máximo una por partido</small>
        </article>
        <article>
          <span>Juegos procesados</span>
          <b>{summary.processedGames ?? 0} / 34</b>
          <small>temporada regular</small>
        </article>
        <article className="gold">
          <span>Recompensas entregadas</span>
          <b>{summary.deliveries}</b>
          <small>entregas activas</small>
        </article>
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">AVANCE GENERAL</p>
            <h2>Distribución de visitas</h2>
          </div>
          <span>{summary.programs} butacas</span>
        </div>
        {distribution.length ? distribution.map((item) => (
          <div className="bar" key={item.visits}>
            <label>{item.visits} visitas <b>{item.total}</b></label>
            <i><em style={{ width: `${(item.total / maxBar) * 100}%` }} /></i>
          </div>
        )) : <div className="empty">Todavía no hay asistencias procesadas.</div>}
      </section>
    </>
  );
}
