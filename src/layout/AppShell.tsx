import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../navigation/Sidebar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { watchCongres, type Congres } from '../firestore/firestoreApi';
import { useCongresId } from '../lib/congresId';
import './app-shell.css';
import ErrorBoundary from '../components/ErrorBoundary';
import { PageActions } from '../components/PageActions';
import { PageActionsProvider, usePageActions } from '../components/PageActionsContext';

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

const DRAWER_BREAKPOINT = 1200;

export default function AppShell() {
  return (
    <PageActionsProvider>
      <AppShellInner />
    </PageActionsProvider>
  );
}

function AppShellInner() {
  const { pathname } = useLocation();
  const segment = pathname.split('/')[1] ?? '';
  const title = TITLES[segment] ?? '';

  const [congresId] = useCongresId();
  const [cfg, setCfg] = useState<(Congres & {id:string}) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const initialIsDrawer = typeof window !== 'undefined' ? window.innerWidth <= DRAWER_BREAKPOINT : false;
  const [drawerMode, setDrawerMode] = useState(initialIsDrawer);
  const [sidebarOpen, setSidebarOpen] = useState(initialIsDrawer ? false : true);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { actions, setActions } = usePageActions();

  useEffect(() => {
    setErr(null);
    const unsub = watchCongres(
      congresId,
      setCfg,
      (e) => setErr(e?.message ?? String(e))
    );
    return () => unsub && unsub();
  }, [congresId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setDrawerMode(false);
      setSidebarOpen(true);
      return;
    }
    const mq = window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT}px)`);
    const apply = (matches: boolean) => {
      setDrawerMode(matches);
      setSidebarOpen(matches ? false : true);
    };
    apply(mq.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      apply(event.matches);
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    if (typeof mq.addListener === 'function') {
      mq.addListener(handleChange);
      return () => mq.removeListener(handleChange);
    }
    return () => undefined;
  }, []);

  useEffect(() => {
    if (drawerMode) {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }
  }, [drawerMode, pathname]);

  useEffect(() => {
    setActions(null);
  }, [pathname, setActions]);

  const closeSidebar = useCallback(() => {
    if (!drawerMode) return;
    setSidebarOpen(false);
    menuButtonRef.current?.focus();
  }, [drawerMode]);

  const toggleSidebar = useCallback(() => {
    if (!drawerMode) return;
    setSidebarOpen(prev => !prev);
  }, [drawerMode]);

  const headerStyle = useMemo(() => {
    const bg = cfg?.backgroundColor;
    if (!bg) return undefined;
    return { background: bg, color: readableOn(bg) };
  }, [cfg?.backgroundColor]);

  const shellClassName = useMemo(() => {
    const classes = ['app-shell'];
    if (drawerMode) classes.push('drawer-mode');
    classes.push(sidebarOpen ? 'sidebar-open' : 'sidebar-closed');
    return classes.join(' ');
  }, [drawerMode, sidebarOpen]);

  return (
    <div className={shellClassName}>
      <Sidebar
        open={sidebarOpen}
        isDrawer={drawerMode}
        onClose={closeSidebar}
      />
      {drawerMode && (
        <div
          className={`app-shell-overlay${sidebarOpen ? ' visible' : ''}`}
          role="presentation"
          onClick={closeSidebar}
        />
      )}
      <main className="app-main">
        <header className="app-header" style={headerStyle}>
          <button
            ref={menuButtonRef}
            type="button"
            className="app-menu-btn"
            aria-controls="app-sidebar"
            aria-expanded={drawerMode ? sidebarOpen : true}
            aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={toggleSidebar}
          >
            <span className="app-menu-icon" aria-hidden="true" />
            <span className="app-menu-label">Menu</span>
          </button>
          <div className="app-header-info">
            <h1>{title}</h1>
            {!!cfg?.appTitle && <div className="app-brand">{cfg.appTitle}</div>}
          </div>
          <PageActions>
            {actions}
          </PageActions>
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
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
