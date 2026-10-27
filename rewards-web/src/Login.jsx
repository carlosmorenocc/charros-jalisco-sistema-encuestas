import React, { useState } from 'react';
import { api } from './api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await api('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      onLogin(response.user);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <section className="login-card" aria-labelledby="login-title">
        <img src="/club-charros.png" alt="Club Charros" />
        <p className="eyebrow">OPERACIÓN INTERNA</p>
        <h1 id="login-title">Programa de Recompensas</h1>
        <p>Acceso individual para el equipo autorizado.</p>
        <form onSubmit={submit}>
          <label>
            Correo institucional
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <div className="error" role="alert">⚠ {error}</div> : null}
          <button disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar de forma segura'}</button>
        </form>
      </section>
    </main>
  );
}
