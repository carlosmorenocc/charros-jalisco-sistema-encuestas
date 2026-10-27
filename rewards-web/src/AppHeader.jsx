import React, { useState } from 'react';

const ADMIN_TABS = [
  ['summary', 'Resumen'],
  ['programs', 'Abonados'],
  ['import', 'Importar'],
];

const OPERATOR_TABS = [['programs', 'Abonados']];

export default function AppHeader({ user, page, onPageChange, onLogout, demo = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = user.role === 'administrator';
  const tabs = isAdmin ? ADMIN_TABS : OPERATOR_TABS;

  const logout = async () => {
    setBusy(true);
    setError('');
    try {
      await onLogout();
    } catch (reason) {
      setError(reason.message);
      setBusy(false);
    }
  };

  return (
    <header>
      <img src="/club-charros.png" alt="Club Charros" />
      <div className="brand">
        <strong>Club Charros</strong>
        <span>Programa de Recompensas</span>
      </div>
      <nav aria-label="Navegación principal">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onPageChange(id)}
            className={page === id ? 'active' : ''}
            aria-current={page === id ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      <details className="user-menu">
        <summary>
          <span>{user.displayName}</span>
          <small>{isAdmin ? 'Administrador' : 'Consulta'}</small>
        </summary>
        <div className="user-menu-popover">
          <b>{user.displayName}</b>
          <small>{user.email}</small>
          {error ? <span className="menu-error" role="alert">{error}</span> : null}
          {demo ? (
            <span className="demo-menu-note">Vista local sin conexión</span>
          ) : (
            <button type="button" onClick={logout} disabled={busy}>
              {busy ? 'Cerrando…' : 'Cerrar sesión'}
            </button>
          )}
        </div>
      </details>
    </header>
  );
}
