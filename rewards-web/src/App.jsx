import React, { useEffect, useState } from 'react';
import { api, clearApiSession } from './api.js';
import AppHeader from './AppHeader.jsx';
import ImportPanel from './ImportPanel.jsx';
import Login from './Login.jsx';
import PasswordChange from './PasswordChange.jsx';
import SubscribersPanel from './SubscribersPanel.jsx';
import SummaryPanel from './SummaryPanel.jsx';

const DEMO_ITEMS = [
  {
    id: 'd1',
    holder_name: 'ABONADO DEMO UNO',
    holder_email: 'demo.uno@example.invalid',
    holder_phone: '33 •••• 0001',
    order_number: 'DEMO-0001',
    segment: 'VIP',
    zone: 'VIP',
    section: 'DEMO-A',
    seat: '01',
    visits: 4,
    delivered_milestones: [2],
  },
  {
    id: 'd2',
    holder_name: 'ABONADO DEMO DOS',
    holder_email: 'demo.dos@example.invalid',
    order_number: 'DEMO-0002',
    segment: 'GENERAL',
    zone: 'PLANTA ALTA CENTRAL',
    section: 'DEMO-B',
    seat: '02',
    visits: 3,
    delivered_milestones: [],
  },
  {
    id: 'd3',
    holder_name: 'ABONADO DEMO TRES',
    holder_phone: '33 •••• 0003',
    order_number: 'DEMO-0003',
    segment: 'VIP',
    zone: 'VIP',
    section: 'DEMO-C',
    seat: '03',
    visits: 2,
    delivered_milestones: [],
  },
];

function Hero() {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">TEMPORADA REGULAR · 34 PARTIDOS</p>
        <h1>Cada juego cuenta.</h1>
        <p>Más visitas, más recompensas.</p>
      </div>
      <div className="cut">
        <span><i className="dot online" />Sesión segura activa</span>
        <b>LMP 2026–2027</b>
      </div>
    </section>
  );
}

export default function App() {
  const demo = import.meta.env.DEV && location.search.includes('demo');
  const demoParams = new URLSearchParams(location.search);
  const demoPage = demoParams.get('page');
  const [user, setUser] = useState(() => (demo
    ? { displayName: 'Vista sintética', email: 'demo@charros.local', role: 'administrator' }
    : null));
  const [authStatus, setAuthStatus] = useState(demo ? 'authenticated' : 'checking');
  const [page, setPage] = useState(demoPage || 'summary');

  useEffect(() => {
    if (demo) return undefined;

    const controller = new AbortController();
    api('/api/auth/session', { signal: controller.signal })
      .then((response) => {
        setUser(response.user);
        setPage(response.user.role === 'administrator' ? 'summary' : 'programs');
        setAuthStatus('authenticated');
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setAuthStatus('anonymous');
      });
    return () => controller.abort();
  }, [demo]);

  useEffect(() => {
    if (demo) return undefined;
    const resetSession = () => {
      clearApiSession();
      setUser(null);
      setAuthStatus('anonymous');
      setPage('summary');
    };
    window.addEventListener('rewards:unauthorized', resetSession);
    return () => window.removeEventListener('rewards:unauthorized', resetSession);
  }, [demo]);

  const login = (nextUser) => {
    setUser(nextUser);
    setPage(nextUser.role === 'administrator' ? 'summary' : 'programs');
    setAuthStatus('authenticated');
  };

  const logout = async () => {
    if (!demo) await api('/api/auth/logout', { method: 'POST' });
    clearApiSession();
    setUser(null);
    setAuthStatus('anonymous');
    setPage('summary');
  };

  if (authStatus === 'checking') {
    return (
      <main className="login session-loading" aria-busy="true">
        <section className="login-card">
          <img src="/club-charros.png" alt="Club Charros" />
          <p>Verificando sesión segura…</p>
        </section>
      </main>
    );
  }

  if (!user) return <Login onLogin={login} />;

  if (user.mustChangePassword) {
    return (
      <PasswordChange
        user={user}
        onDone={() => setUser((current) => ({ ...current, mustChangePassword: false }))}
      />
    );
  }

  const isAdmin = user.role === 'administrator';

  return (
    <div className="app">
      <AppHeader user={user} page={page} onPageChange={setPage} onLogout={logout} demo={demo} />
      <main className="content">
        <Hero />
        {page === 'summary' && isAdmin ? <SummaryPanel demo={demo} /> : null}
        {page === 'programs' ? (
          <SubscribersPanel
            demo={demo}
            demoItems={DEMO_ITEMS}
            initialSelected={demo && demoParams.has('profile') ? DEMO_ITEMS[0] : null}
          />
        ) : null}
        {page === 'import' && isAdmin ? <ImportPanel demo={demo} /> : null}
      </main>
    </div>
  );
}
