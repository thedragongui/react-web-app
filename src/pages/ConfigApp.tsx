import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCongresId } from '../lib/congresId';
import {
  watchAppConfig,
  saveAppConfig,
  type AppConfig,
} from '../firestore/firestoreApi';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import './personalisation.css';

const MAX_MB = 10;
const BANNER_DIM = { w: 1024, h: 500 };
const SPLASH_DIM = { w: 1024, h: 1024 };

function clean(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}

async function uploadImage(kind: 'banner' | 'splash' | 'logo', congresId: string, file: File) {
  const ts = Date.now();
  const path = `imgSponsors/app/${congresId}/${kind}_${ts}_${clean(file.name)}`;
  const handle = ref(storage, path);
  const snap = await uploadBytes(handle, file);
  const url = await getDownloadURL(snap.ref);
  return { path, url };
}

async function removeAt(path?: string | null) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // ignore cleanup failure
  }
}

async function ensureDims(file: File, wanted: { w: number; h: number }) {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.width === wanted.w && img.height === wanted.h) {
        resolve();
      } else {
        reject(new Error(`Dimensions ${img.width}x${img.height} detectees, attendu ${wanted.w}x${wanted.h}px.`));
      }
    };
    img.onerror = () => reject(new Error("Impossible de lire l'image."));
    img.src = URL.createObjectURL(file);
  });
}

function sizeOk(file: File) {
  return file.size <= MAX_MB * 1024 * 1024;
}

type UploadTileProps = {
  title: string;
  helper: string;
  note?: string;
  preview?: string | null;
  optional?: boolean;
  onPick: (file?: File | null) => void;
  disabled?: boolean;
};

function UploadTile({ title, helper, note, preview, optional, onPick, disabled }: UploadTileProps) {
  const parts = [helper];
  if (note) parts.push(note);
  if (optional) parts.push('optionnel');
  return (
    <div className="upload-tile">
      <div className="config-section-title">
        <strong>{title}</strong>
        <span className="upload-meta">{parts.join(' | ')}</span>
      </div>
      <div className="upload-preview">
        {preview ? <img src={preview} alt={title} /> : <span>Aucune image</span>}
      </div>
      <label className="upload-drop">
        <span>Inserer une image</span>
        <input type="file" accept="image/png,image/jpeg" hidden disabled={disabled} onChange={(event) => onPick(event.target.files?.[0])} />
      </label>
    </div>
  );
}

type StepId = 'identity' | 'store' | 'features';

type Step = {
  id: StepId;
  label: string;
  index: number;
  disabled?: boolean;
  badge?: ReactNode;
};

const STEPS: Step[] = [
  { id: 'identity', index: 1, label: 'Identite visuelle' },
  { id: 'store', index: 2, label: 'Informations Store' },
  { id: 'features', index: 3, label: 'Choix des fonctionnalites' },
];

export default function ConfigApp() {
  const { isAdmin } = useAuth();
  const [congresId] = useCongresId();

  const [tab, setTab] = useState<StepId>('identity');
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = watchAppConfig(
      congresId,
      (incoming) => {
        setCfg(incoming ?? {});
        setLoading(false);
      },
      (error) => {
        setErr(error?.message ?? String(error));
        setLoading(false);
      },
    );
    return () => {
      if (typeof unsub === 'function') {
        unsub();
      }
    };
  }, [congresId]);

  const identity = cfg?.identity ?? {};
  const store = cfg?.store ?? { appName: '' };

  const validStore = useMemo(() => !!store.appName?.trim(), [store.appName]);

  const updateIdentity = (patch: Partial<typeof identity>) => {
    setCfg((current) => ({
      ...(current ?? {}),
      identity: { ...(current?.identity ?? {}), ...patch },
      store: current?.store ?? store,
    }));
  };

  const updateStore = (patch: Partial<typeof store>) => {
    setCfg((current) => ({
      ...(current ?? {}),
      identity: current?.identity ?? identity,
      store: { ...(current?.store ?? {}), ...patch },
    }));
  };

  const bannerNote = `${BANNER_DIM.w} x ${BANNER_DIM.h} px - ${MAX_MB} Mo max`;
  const splashNote = `${SPLASH_DIM.w} x ${SPLASH_DIM.h} px - ${MAX_MB} Mo max`;

  async function onPick(kind: 'banner' | 'splash' | 'logo', file?: File | null) {
    if (!file) return;
    if (!isAdmin) { setErr('Reserve aux administrateurs.'); return; }
    if (!sizeOk(file)) { setErr(`Fichier > ${MAX_MB} Mo.`); return; }
    try {
      setErr(null);
      setMsg('Televersement en cours...');
      if (kind === 'banner') await ensureDims(file, BANNER_DIM);
      if (kind === 'splash') await ensureDims(file, SPLASH_DIM);
      const up = await uploadImage(kind, congresId, file);

      if (kind === 'banner') await removeAt(store.bannerPath);
      if (kind === 'splash') await removeAt(store.splashPath);
      if (kind === 'logo') await removeAt(identity.logoPath);

      const patch: Partial<AppConfig> = {};
      if (kind === 'banner') patch.store = { ...store, bannerUrl: up.url, bannerPath: up.path };
      if (kind === 'splash') patch.store = { ...store, splashUrl: up.url, splashPath: up.path };
      if (kind === 'logo') patch.identity = { ...identity, logoUrl: up.url, logoPath: up.path };

      await saveAppConfig(congresId, patch);
      setMsg('Image enregistree.');
      setTimeout(() => setMsg(null), 2000);
    } catch (error: any) {
      setErr(error?.message ?? String(error));
    }
  }

  async function saveIdentity(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setErr(null);
    try {
      await saveAppConfig(congresId, { identity: cfg?.identity ?? identity });
      setMsg('Identite enregistree.');
      setTimeout(() => setMsg(null), 2000);
    } catch (error: any) {
      setErr(error?.message ?? String(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveStore(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setErr(null);
    try {
      await saveAppConfig(congresId, { store: cfg?.store ?? store });
      setMsg('Informations enregistrees.');
      setTimeout(() => setMsg(null), 2000);
    } catch (error: any) {
      setErr(error?.message ?? String(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="config-page"><div className="config-message">Chargement...</div></div>;
  }

  return (
    <div className="config-page">
      <header className="config-header">
        <h1>Configuration</h1>
        <nav className="config-stepper">
          {STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              className={`config-step ${tab === step.id ? 'active' : ''}`}
              onClick={() => setTab(step.id)}
              disabled={step.disabled}
            >
              <span className="step-index">{step.index}</span>
              <span>{step.label}</span>
              {step.badge}
            </button>
          ))}
        </nav>
        {msg && <span className="config-message">{msg}</span>}
      </header>

      {err && <div className="config-error">Erreur : {err}</div>}

      <main className="config-body">
        {tab === 'identity' && (
          <form className="config-card" onSubmit={saveIdentity}>
            <h2>Identite visuelle</h2>

            <div className="upload-grid">
              <UploadTile
                title="Icon App"
                helper="PNG ou JPG"
                note="1024 x 1024 px"
                preview={identity.logoUrl}
                onPick={(file) => onPick('logo', file)}
                disabled={!isAdmin}
              />
              <UploadTile
                title="Banniere"
                helper="PNG ou JPG"
                note={bannerNote}
                preview={store.bannerUrl}
                onPick={(file) => onPick('banner', file)}
                disabled={!isAdmin}
              />
              <UploadTile
                title="Splashscreen"
                helper="PNG ou JPG"
                note={splashNote}
                preview={store.splashUrl}
                optional
                onPick={(file) => onPick('splash', file)}
                disabled={!isAdmin}
              />
            </div>

            <div className="color-grid">
              <div className="field-group">
                <label>Couleur principale</label>
                <div className="color-input">
                  <input
                    value={identity.primaryColor ?? ''}
                    onChange={(event) => updateIdentity({ primaryColor: event.target.value })}
                    placeholder="#111827"
                  />
                  <input
                    type="color"
                    value={identity.primaryColor || '#111827'}
                    onChange={(event) => updateIdentity({ primaryColor: event.target.value })}
                  />
                </div>
              </div>
              <div className="field-group">
                <label>Couleur secondaire</label>
                <div className="color-input">
                  <input
                    value={identity.secondaryColor ?? ''}
                    onChange={(event) => updateIdentity({ secondaryColor: event.target.value })}
                    placeholder="#2563eb"
                  />
                  <input
                    type="color"
                    value={identity.secondaryColor || '#2563eb'}
                    onChange={(event) => updateIdentity({ secondaryColor: event.target.value })}
                  />
                </div>
              </div>
              <div className="field-group">
                <label>Couleur tertiaire</label>
                <div className="color-input">
                  <input
                    value={identity.textColor ?? ''}
                    onChange={(event) => updateIdentity({ textColor: event.target.value })}
                    placeholder="#ffffff"
                  />
                  <input
                    type="color"
                    value={identity.textColor || '#ffffff'}
                    onChange={(event) => updateIdentity({ textColor: event.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="config-footer">
              <button className="btn-primary" disabled={saving || !isAdmin}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button type="button" className="btn-next" onClick={() => setTab('store')}>
                Suivant
              </button>
            </div>
          </form>
        )}

        {tab === 'store' && (
          <form className="config-card store-form" onSubmit={saveStore}>
            <h2>Informations Store</h2>

            <div className="field-group">
              <label>Nom de l'application *</label>
              <input
                value={store.appName ?? ''}
                onChange={(event) => updateStore({ appName: event.target.value })}
                placeholder="ECON 2025"
              />
            </div>

            <div className="field-group">
              <label>Breve description</label>
              <input
                maxLength={180}
                value={store.shortDescription ?? ''}
                onChange={(event) => updateStore({ shortDescription: event.target.value })}
                placeholder="Breve description de l'application..."
              />
            </div>

            <div className="field-group">
              <label>Description complete</label>
              <textarea
                rows={6}
                maxLength={4000}
                value={store.longDescription ?? ''}
                onChange={(event) => updateStore({ longDescription: event.target.value })}
                placeholder="Description detaillee..."
              />
            </div>

            <div className="store-actions">
              <button className="btn-primary" disabled={!validStore || !isAdmin || saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>

            <div className="config-footer">
              <button type="button" className="btn-outline" onClick={() => setTab('identity')}>
                Retour
              </button>
              <button type="button" className="btn-next" onClick={() => setTab('features')}>
                Suivant
              </button>
            </div>
          </form>
        )}

        {tab === 'features' && (
          <div className="config-card">
            <h2>Choix des fonctionnalites</h2>
            <div className="features-placeholder">En cours de reflexion</div>
            <div className="config-footer">
              <button type="button" className="btn-outline" onClick={() => setTab('store')}>
                Retour
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
