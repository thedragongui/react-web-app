import { useEffect, useMemo, useState } from 'react';
import { updateCongres, getCongres, type Congres } from '../firestore/firestoreApi';
import { useAuth } from '../auth/AuthContext';
import { useCongresId, setCurrentCongresId } from '../lib/congresId';
import './personalisation.css';

const isHex = (v: string) => /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(v);

export default function Personalisation() {
  const { isAdmin } = useAuth();
  const [congresId] = useCongresId();              // global
  const [localId, setLocalId] = useState(congresId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // champs
  const [appTitle, setAppTitle] = useState('');
  const [description, setDescription] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('#111827');
  const DEFAULT_ITEMS = ['sessions','presentations','participants','sponsors','programme'] as const;
  type DashKey = typeof DEFAULT_ITEMS[number];
  const [dashBoardItems, setDashBoardItems] = useState<NonNullable<Congres['dashBoardItems']>>(
    [...DEFAULT_ITEMS]
  );

  function normalizeDashItems(input: any): DashKey[] {
    const valid = new Set<DashKey>(DEFAULT_ITEMS as unknown as DashKey[]);
    if (!Array.isArray(input)) return [...DEFAULT_ITEMS] as unknown as DashKey[];
    const keys = input.map((x: any) => {
      if (typeof x === 'string') return x as DashKey;
      if (x && typeof x === 'object') {
        const cand = x.route ?? x.id ?? x.title;
        if (typeof cand === 'string') return cand as DashKey;
      }
      return undefined;
    }).filter((k: any): k is DashKey => !!k && valid.has(k as DashKey));
    return keys.length ? keys : [...DEFAULT_ITEMS] as unknown as DashKey[];
  }

  useEffect(() => setLocalId(congresId), [congresId]);

  useEffect(() => {
    if (!localId) return;
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const doc = await getCongres(localId);
        if (cancelled) return;
        setLoading(false);
        if (!doc) return;
        setAppTitle(String(doc.appTitle ?? doc.title ?? ''));
        setDescription(String(doc.description ?? ''));
        setBackgroundColor(String(doc.backgroundColor ?? '#111827'));
        setDashBoardItems(normalizeDashItems((doc as any).dashBoardItems));
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [localId]);

  const valid = useMemo(() => !!appTitle.trim() && isHex(backgroundColor), [appTitle, backgroundColor]);

  function toggle(key: NonNullable<Congres['dashBoardItems']>[number]) {
    setDashBoardItems(arr => arr.includes(key) ? arr.filter(k => k !== key) as any : [...arr, key] as any);
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      await updateCongres(localId, {
        appTitle: appTitle.trim(),
        description: description.trim(),
        backgroundColor,
        dashBoardItems,
        updatedAt: new Date().toISOString(),
      } as Congres);
      // Mémorise globalement l’ID choisi
      setCurrentCongresId(localId);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="perso">
      <div className="toolbar">
        <label>
          Congrès ID&nbsp;
          <input value={localId} onChange={(e) => setLocalId(e.target.value)} />
        </label>
        <button className="btn-ghost" onClick={() => setCurrentCongresId(localId)} disabled={!localId || localId===congresId}>
          Utiliser cet ID partout
        </button>
        <div className="spacer" />
        <button className="btn-ghost" onClick={() => window.location.reload()} disabled={loading}>↻ Recharger</button>
      </div>

      <div className="grid">
        <form className="card form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <h3>Paramètres généraux</h3>

          <label className="field">
            <span>Titre de l’application *</span>
            <input value={appTitle} onChange={(e) => setAppTitle(e.target.value)} placeholder="Nom du congrès / app" />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Texte d’intro, baseline…" />
          </label>

          <label className="field">
            <span>Couleur principale *</span>
            <div className="row">
              <input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} placeholder="#111827" />
              <input type="color" value={isHex(backgroundColor) ? backgroundColor : '#111827'} onChange={(e) => setBackgroundColor(e.target.value)} />
            </div>
            {!isHex(backgroundColor) && <div className="hint error">Hex invalide (ex: #123ABC).</div>}
          </label>

          <div className="field">
            <span>Cartes Dashboard</span>
            <div className="chips">
              {(['sessions','presentations','participants','sponsors','programme'] as const).map(k => (
                <label key={k} className={'chip' + (dashBoardItems.includes(k) ? ' active' : '')}>
                  <input type="checkbox" checked={dashBoardItems.includes(k)} onChange={() => toggle(k)} />
                  {k}
                </label>
              ))}
            </div>
          </div>

          {error && <div className="alert error">{error}</div>}

          <div className="actions">
            {/* write est autorisé par tes règles à tout user connecté ; on restreint l'UI aux admins */}
            <button type="submit" className="btn-primary" disabled={!valid || !isAdmin || saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {!isAdmin && <span className="hint">(Seuls les admins peuvent enregistrer)</span>}
          </div>
        </form>

        <PreviewCard appTitle={appTitle} description={description} color={backgroundColor} items={dashBoardItems} />
      </div>
    </div>
  );
}

/* --- Petit composant d’aperçu --- */
function PreviewCard({ appTitle, description, color, items }:{
  appTitle:string; description:string; color:string; items: NonNullable<Congres['dashBoardItems']>;
}) {
  return (
    <div className="card preview">
      <h3>Aperçu</h3>
      <div className="app-preview" style={{ background: isHex(color) ? color : '#111827' }}>
        <div className="app-title">{appTitle || 'Titre de l’application'}</div>
        <div className="app-desc">{description || 'Description…'}</div>
        <div className="app-cards">
          {(items.length ? items : ['sessions','presentations','participants','sponsors','programme']).map((k) => (
            <div key={k} className="app-card">{k}</div>
          ))}
        </div>
      </div>
      <div className="hint">Le Dashboard et l’en-tête utilisent ces paramètres.</div>
    </div>
  );
}
