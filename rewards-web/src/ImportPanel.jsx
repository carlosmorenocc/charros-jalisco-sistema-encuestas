import React, { useEffect, useState } from 'react';
import { api, upload } from './api.js';

const DEMO_GAMES = Array.from({ length: 34 }, (_, index) => ({
  id: `demo-game-${index + 1}`,
  sequence_number: index + 1,
  display_name: `Partido de demostración ${index + 1}`,
}));

const DEMO_PREVIEW = {
  totalRows: 120,
  counts: { included: 112, excluded: 5, review: 3, duplicates: 0 },
  sha256: 'vista-local-sin-escritura',
};

export default function ImportPanel({ demo = false }) {
  const [file, setFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [preview, setPreview] = useState(null);
  const [games, setGames] = useState(() => (demo ? DEMO_GAMES : []));
  const [gameId, setGameId] = useState('');
  const [reportStatus, setReportStatus] = useState('closed');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return undefined;
    const controller = new AbortController();
    api('/api/games', { signal: controller.signal })
      .then((data) => setGames(data.items || []))
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [demo]);

  const run = async (confirm = false) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (demo) {
        if (confirm) {
          setNotice('✓ Vista demostrativa: no se guardó información.');
          setPreview(null);
          setFile(null);
          setGameId('');
          setFileInputKey((current) => current + 1);
        } else {
          setPreview(DEMO_PREVIEW);
        }
        return;
      }
      const endpoint = confirm
        ? `/api/admin/imports/confirm?kind=access&gameId=${encodeURIComponent(gameId)}&reportStatus=${reportStatus}`
        : `/api/admin/imports/preview?kind=access&gameId=${encodeURIComponent(gameId)}`;
      const data = await upload(endpoint, file);
      if (confirm) {
        setNotice(`✓ Importación confirmada: ${data.summary.inserted} asistencias nuevas y ${data.summary.alreadyCounted} ya contabilizadas.`);
        setPreview(null);
        setFile(null);
        setGameId('');
        setFileInputKey((current) => current + 1);
      } else {
        setPreview(data);
      }
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel import">
      <p className="eyebrow">SOLO ADMINISTRADOR</p>
      <h2>Importar asistencias</h2>
      <p className="hint">Carga el reporte detallado de accesos de cada uno de los 34 partidos de temporada regular.</p>
      <div className="steps" aria-label="Proceso de importación">
        <b>1 Archivo</b><b>2 Partido y corte</b><b>3 Revisión</b><b>4 Confirmación</b>
      </div>
      <div className="import-controls">
        <label>
          Partido
          <select value={gameId} onChange={(event) => { setGameId(event.target.value); setPreview(null); }} required>
            <option value="">Selecciona un partido</option>
            {games.map((game) => (
              <option value={game.id} key={game.id}>
                {game.sequence_number}. {game.display_name}
              </option>
            ))}
          </select>
          <small>{games.length} de 34 partidos configurados</small>
        </label>
        <label>
          Tipo de corte
          <select value={reportStatus} onChange={(event) => { setReportStatus(event.target.value); setPreview(null); }}>
            <option value="partial">Parcial</option>
            <option value="closed">Cerrado</option>
          </select>
        </label>
        <label>
          Reporte de asistencias
          <input
            key={fileInputKey}
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              setFile(event.target.files[0] || null);
              setPreview(null);
            }}
          />
        </label>
        <button type="button" disabled={!file || !gameId || busy} onClick={() => run(false)}>
          {busy ? 'Analizando…' : 'Previsualizar'}
        </button>
      </div>
      {error ? <div className="error" role="alert">⚠ {error}</div> : null}
      {notice ? <div className="success" role="status">{notice}</div> : null}
      {preview ? (
        <div className="preview">
          <h3>Resultado antes de escribir</h3>
          {[
            ['Filas', preview.totalRows],
            ['Incluidas', preview.counts.included],
            ['Excluidas', preview.counts.excluded],
            ['Por revisar', preview.counts.review],
            ['Duplicadas', preview.counts.duplicates],
          ].map(([label, value]) => (
            <div key={label}><b>{value}</b><span>{label}</span></div>
          ))}
          <small>SHA-256: {preview.sha256}</small>
          <p>Verifica el partido y el estado del corte. La confirmación se ejecutará en una sola transacción.</p>
          <button className="confirm" type="button" disabled={busy || !gameId} onClick={() => run(true)}>
            {busy ? 'Guardando…' : 'Confirmar importación'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
