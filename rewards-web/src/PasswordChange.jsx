import React, { useState } from 'react';
import { api } from './api.js';

export default function PasswordChange({ user, onDone }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { password } });
      onDone();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <section className="login-card" aria-labelledby="password-title">
        <img src="/club-charros.png" alt="Club Charros" />
        <p className="eyebrow">PRIMER INGRESO</p>
        <h1 id="password-title">Crea tu contraseña</h1>
        <p>{user.displayName}, la contraseña temporal debe reemplazarse antes de continuar.</p>
        <form onSubmit={submit}>
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength="12"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirmar contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength="12"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
          {error ? <div className="error" role="alert">⚠ {error}</div> : null}
          <button disabled={busy}>{busy ? 'Guardando…' : 'Guardar y continuar'}</button>
        </form>
      </section>
    </main>
  );
}
