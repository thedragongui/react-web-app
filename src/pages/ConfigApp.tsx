import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCongresId } from '../lib/congresId';      // ou remplace par ton DEFAULT_CONGRES_ID
import {
  watchAppConfig, saveAppConfig, type AppConfig
} from '../firestore/firestoreApi';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import './personalisation.css'; // réutilise tes styles de cartes/modales/boutons

const MAX_MB = 10;
const BANNER_DIM = { w: 1024, h: 500 };
const SPLASH_DIM = { w: 1024, h: 1024 };

function clean(name: string) { return name.replace(/[^\w.\-]/g, '_'); }

async function uploadImage(kind: 'banner'|'splash'|'logo', congresId: string, file: File) {
  const ts = Date.now();
  const path = `imgSponsors/app/${congresId}/${kind}_${ts}_${clean(file.name)}`;
  const r = ref(storage, path);
  const snap = await uploadBytes(r, file);
  const url = await getDownloadURL(snap.ref);
  return { path, url };
}
async function removeAt(path?: string) { if (path) try { await deleteObject(ref(storage, path)); } catch {} }

async function ensureDims(file: File, wanted: {w:number;h:number}) {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.width === wanted.w && img.height === wanted.h) ? resolve() :
      reject(new Error(`Dimensions ${img.width}×${img.height} reçues, attendu ${wanted.w}×${wanted.h}px.`));
    img.onerror = () => reject(new Error('Impossible de lire l’image.'));
    img.src = URL.createObjectURL(file);
  });
}
function sizeOk(file: File) { return file.size <= MAX_MB * 1024 * 1024; }

export default function ConfigApp() {
  const { isAdmin } = useAuth();
  const [congresId] = useCongresId();

  const [tab, setTab] = useState<'identity'|'store'>('identity');
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = watchAppConfig(congresId, (c) => { setCfg(c ?? {}); setLoading(false); }, (e) => {
      setErr(e?.message ?? String(e)); setLoading(false);
    });
    return () => unsub && unsub();
  }, [congresId]);

  const identity = cfg?.identity ?? {};
  const store = cfg?.store ?? { appName: '' };

  const validIdentity = useMemo(() => true, []);
  const validStore = useMemo(() => !!store.appName?.trim(), [store.appName]);

  async function onPick(kind: 'banner'|'splash'|'logo', file?: File | null) {
    if (!file) return;
    if (!isAdmin) { setErr("Réservé aux admins."); return; }
    if (!sizeOk(file)) { setErr(`Fichier > ${MAX_MB} Mo.`); return; }
    try {
      setErr(null); setMsg('Téléversement…');
      if (kind === 'banner') await ensureDims(file, BANNER_DIM);
      if (kind === 'splash') await ensureDims(file, SPLASH_DIM);
      const up = await uploadImage(kind, congresId, file);

      // supprime l’ancien si on remplace
      if (kind === 'banner') await removeAt(store.bannerPath);
      if (kind === 'splash') await removeAt(store.splashPath);
      if (kind === 'logo')   await removeAt(identity.logoPath);

      const patch: Partial<AppConfig> = { };
      if (kind === 'banner') patch.store = { ...store, bannerUrl: up.url, bannerPath: up.path };
      if (kind === 'splash') patch.store = { ...store, splashUrl: up.url, splashPath: up.path };
      if (kind === 'logo')   patch.identity = { ...identity, logoUrl: up.url, logoPath: up.path };
      await saveAppConfig(congresId, patch);
      setMsg('Image enregistrée ✅'); setTimeout(() => setMsg(null), 2000);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function saveIdentity(e: FormEvent) {
    e.preventDefault(); if (!isAdmin) return;
    setSaving(true); setErr(null);
    try {
      await saveAppConfig(congresId, { identity });
      setMsg('Identité enregistrée ✅'); setTimeout(() => setMsg(null), 2000);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setSaving(false); }
  }
  async function saveStore(e: FormEvent) {
    e.preventDefault(); if (!isAdmin) return;
    setSaving(true); setErr(null);
    try {
      await saveAppConfig(congresId, { store });
      setMsg('Informations enregistrées ✅'); setTimeout(() => setMsg(null), 2000);
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="perso"><div className="hint">Chargement…</div></div>;

  return (
    <div className="perso">
      <div className="tabs">
        <button className={tab==='identity'?'active':''} onClick={() => setTab('identity')}>Identité visuelle</button>
        <button className={tab==='store'?'active':''} onClick={() => setTab('store')}>Informations Store</button>
        <div className="spacer" />
        {msg && <span className="hint">{msg}</span>}
      </div>

      {err && <div className="alert error">Erreur : {err}</div>}

      {tab === 'identity' && (
        <form className="card form" onSubmit={saveIdentity}>
          <h3>Identité visuelle</h3>

          <label className="field">
            <span>Couleur primaire</span>
            <div className="row">
              <input value={identity.primaryColor ?? ''} onChange={e => setCfg(c => ({...c, identity:{...identity, primaryColor: e.target.value}}))} placeholder="#111827" />
              <input type="color" value={identity.primaryColor || '#111827'} onChange={e => setCfg(c => ({...c, identity:{...identity, primaryColor: e.target.value}}))} />
            </div>
          </label>

          <div className="grid-2">
            <label className="field">
              <span>Couleur secondaire</span>
              <input value={identity.secondaryColor ?? ''} onChange={e => setCfg(c => ({...c, identity:{...identity, secondaryColor: e.target.value}}))} placeholder="#2563eb" />
            </label>
            <label className="field">
              <span>Texte</span>
              <input value={identity.textColor ?? ''} onChange={e => setCfg(c => ({...c, identity:{...identity, textColor: e.target.value}}))} placeholder="#ffffff" />
            </label>
          </div>

          <label className="field">
            <span>Logo</span>
            <div className="logo-row">
              <div className="logo-preview">
                {identity.logoUrl ? <img src={identity.logoUrl} alt="logo" /> : <div className="logo-empty">Aucun</div>}
              </div>
              <label className="btn-ghost">
                Choisir une image
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onPick('logo', e.target.files?.[0])}/>
              </label>
            </div>
          </label>

          <div className="actions">
            <button className="btn-primary" disabled={!validIdentity || !isAdmin || saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {!isAdmin && <span className="hint">(Seuls les admins peuvent enregistrer)</span>}
          </div>
        </form>
      )}

      {tab === 'store' && (
        <form className="card form" onSubmit={saveStore}>
          <h3>Informations Store</h3>

          <label className="field">
            <span>Nom de l’application *</span>
            <input value={store.appName ?? ''} onChange={e => setCfg(c => ({...c, store:{...store, appName: e.target.value}}))} placeholder="ECON 2025" />
          </label>

          <label className="field">
            <span>Brève description</span>
            <input maxLength={180} value={store.shortDescription ?? ''} onChange={e => setCfg(c => ({...c, store:{...store, shortDescription: e.target.value}}))} placeholder="Brève description de l’application…" />
          </label>

          <label className="field">
            <span>Description complète</span>
            <textarea rows={6} maxLength={4000} value={store.longDescription ?? ''} onChange={e => setCfg(c => ({...c, store:{...store, longDescription: e.target.value}}))} placeholder="Description détaillée…" />
          </label>

          <div className="field">
            <span>Bandeau (PNG/JPG ≤ {MAX_MB} Mo – {BANNER_DIM.w}×{BANNER_DIM.h}px)</span>
            <div className="logo-row">
              <div className="logo-preview">{store.bannerUrl ? <img src={store.bannerUrl} alt="bandeau" /> : <div className="logo-empty">Aucun</div>}</div>
              <label className="btn-ghost">
                Choisir une image
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onPick('banner', e.target.files?.[0])}/>
              </label>
            </div>
          </div>

          <div className="field">
            <span>Splashscreen (PNG/JPG ≤ {MAX_MB} Mo – {SPLASH_DIM.w}×{SPLASH_DIM.h}px)</span>
            <div className="logo-row">
              <div className="logo-preview">{store.splashUrl ? <img src={store.splashUrl} alt="splash" /> : <div className="logo-empty">Aucun</div>}</div>
              <label className="btn-ghost">
                Choisir une image
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onPick('splash', e.target.files?.[0])}/>
              </label>
            </div>
          </div>

          <div className="actions">
            <button className="btn-primary" disabled={!validStore || !isAdmin || saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

