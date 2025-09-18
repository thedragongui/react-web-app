import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../navigation/Sidebar';
import { useEffect, useMemo, useState } from 'react';
import { watchCongres, type Congres } from '../firestore/firestoreApi';
import { useCongresId } from '../lib/congresId';
import './app-shell.css';
import ErrorBoundary from '../components/ErrorBoundary';

const TITLES: Record<string, string> = {
  '': 'Tableau de bord',
  personnalisation: 'Personnalisation',
  programme: 'Programme',
  sponsors: 'Sponsors',
  participants: 'Participants',
  badges: 'Badges',
  'importation-pdf': 'Importation PDF',
  liens: 'Liens',
  profil: 'Mon compte',
};

function readableOn(bg?: string) {
  if (!bg || !bg.startsWith('#') || (bg.length !== 7 && bg.length !== 4)) return '#111827';
  // calc luminance approx
  const hex = bg.length === 4 ? '#' + [...bg.slice(1)].map(c => c+c).join('') : bg;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const L = (0.2126*r + 0.7152*g + 0.0722*b);
  return L < 140 ? '#fff' : '#111827';
}

export default function AppShell() {
  const { pathname } = useLocation();
  const segment = pathname.split('/')[1] ?? '';
  const title = TITLES[segment] ?? '';

  const [congresId] = useCongresId();
  const [cfg, setCfg] = useState<(Congres & {id:string}) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    const unsub = watchCongres(
      congresId,
      setCfg,
      (e) => setErr(e?.message ?? String(e))
    );
    return () => unsub && unsub();
  }, [congresId]);

  const headerStyle = useMemo(() => {
    const bg = cfg?.backgroundColor;
    if (!bg) return undefined;
    return { background: bg, color: readableOn(bg) };
  }, [cfg?.backgroundColor]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className="app-header" style={headerStyle}>
          <h1>{title}</h1>
          {!!cfg?.appTitle && <div className="app-brand">{cfg.appTitle}</div>}
        </header>
        <div className="app-content">
          {err && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#991b1b',
              borderRadius: 8
            }}>
              Erreur de chargement des paramètres du congrès: {err}
            </div>
          )}
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
