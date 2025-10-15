import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCongresId } from '../lib/congresId';
import {
  watchAppConfig,
  saveAppConfig,
  watchNotifications,
  createNotification,
  updateNotification,
  markNotificationStatus,
  removeNotification,
  type AppConfig,
  type AppIdentity,
  type AppStoreInfo,
  type AppNotification,
  type NotificationStatus,
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

type NotificationRow = AppNotification & { id: string };
type NotificationFormState = {
  id: string | null;
  title: string;
  scheduledDate: string;
  scheduledTime: string;
  message: string;
  status: NotificationStatus;
};
type FeedbackState = { type: 'success' | 'error'; message: string } | null;

const STATUS_LABELS: Record<NotificationStatus, string> = {
  scheduled: 'Programmé',
  sent: 'Envoyé',
  deleted: 'Supprimé',
};
const STATUS_VARIANTS: Record<NotificationStatus, string> = {
  scheduled: 'scheduled',
  sent: 'sent',
  deleted: 'deleted',
};
const STATUS_FALLBACK: NotificationStatus = 'scheduled';

function pad2(value: number) {
  return value.toString().padStart(2, '0');
}

function ensureDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof (value as any)?.toDate === 'function') {
    const date = (value as any).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

function formatInputDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatInputTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatDayLabel(date: Date): string {
  const day = pad2(date.getDate());
  const monthLabel = date.toLocaleString('fr-FR', { month: 'short' }).replace('.', '').toLowerCase();
  return `${day}-${monthLabel}`;
}

function defaultNotificationDate(): Date {
  const base = new Date();
  base.setSeconds(0, 0);
  base.setMinutes(0);
  base.setHours(base.getHours() + 1);
  return base;
}

function createEmptyNotificationForm(): NotificationFormState {
  const target = defaultNotificationDate();
  return {
    id: null,
    title: '',
    scheduledDate: formatInputDate(target),
    scheduledTime: formatInputTime(target),
    message: '',
    status: STATUS_FALLBACK,
  };
}

function mapNotificationToForm(row: NotificationRow): NotificationFormState {
  const scheduledDate = row.scheduledDate;
  const scheduledTime = row.scheduledTime;
  const referenceDate =
    (scheduledDate && ensureDate(scheduledDate)) ||
    ensureDate(row.scheduledAt) ||
    ensureDate(row.createdAt) ||
    defaultNotificationDate();

  return {
    id: row.id,
    title: row.title ?? '',
    scheduledDate: scheduledDate ?? formatInputDate(referenceDate),
    scheduledTime: scheduledTime ?? formatInputTime(referenceDate),
    message: row.message ?? '',
    status: row.status ?? STATUS_FALLBACK,
  };
}

function getRowDay(row: NotificationRow): string {
  if (row.scheduledDate) {
    const parsed = ensureDate(row.scheduledDate);
    return parsed ? formatDayLabel(parsed) : row.scheduledDate;
  }
  const date = ensureDate(row.scheduledAt) || ensureDate(row.createdAt);
  return date ? formatDayLabel(date) : '—';
}

function getRowTime(row: NotificationRow): string {
  if (row.scheduledTime) {
    return row.scheduledTime.length > 5 ? row.scheduledTime.slice(0, 5) : row.scheduledTime;
  }
  const date = ensureDate(row.scheduledAt);
  if (!date) return '—';
  return formatInputTime(date);
}

type NotificationsPanelProps = {
  congresId: string;
  isAdmin: boolean;
  onBack: () => void;
  onNext?: () => void;
};

function NotificationsPanel({ congresId, isAdmin, onBack, onNext }: NotificationsPanelProps) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NotificationFormState>(() => createEmptyNotificationForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsubscribe = watchNotifications(
      congresId,
      (incoming) => {
        setRows(incoming);
        setLoading(false);
      },
      (watchError) => {
        setError(watchError?.message ?? String(watchError));
        setLoading(false);
      },
    );
    return () => {
      unsubscribe();
      setRows([]);
    };
  }, [congresId]);

  function openCreateModal() {
    setFeedback(null);
    setForm(createEmptyNotificationForm());
    setModalOpen(true);
  }

  function openEditModal(row: NotificationRow) {
    setFeedback(null);
    setForm(mapNotificationToForm(row));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSaving(false);
  }

  function updateField<Key extends keyof NotificationFormState>(key: Key, value: NotificationFormState[Key]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || saving) return;

    const trimmedTitle = form.title.trim();
    const trimmedMessage = form.message.trim();
    if (!trimmedTitle) {
      setFeedback({ type: 'error', message: 'Le titre est obligatoire.' });
      return;
    }
    if (!trimmedMessage) {
      setFeedback({ type: 'error', message: 'Le message est obligatoire.' });
      return;
    }
    if (!form.scheduledDate) {
      setFeedback({ type: 'error', message: "La date d'envoi est requise." });
      return;
    }
    if (!form.scheduledTime) {
      setFeedback({ type: 'error', message: "L'heure d'envoi est requise." });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: trimmedTitle,
        message: trimmedMessage,
        scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime,
        status: form.status,
      };

      if (form.id) {
        await updateNotification(congresId, form.id, payload);
        setFeedback({ type: 'success', message: 'Notification mise à jour.' });
      } else {
        await createNotification(congresId, payload);
        setFeedback({ type: 'success', message: 'Notification créée.' });
      }
      closeModal();
    } catch (submitError: any) {
      setFeedback({ type: 'error', message: submitError?.message ?? String(submitError) });
      setSaving(false);
    }
  }

  async function handleDelete(row: NotificationRow) {
    if (!isAdmin) return;
    const alreadyDeleted = (row.status ?? STATUS_FALLBACK) === 'deleted';
    const question = alreadyDeleted
      ? 'Supprimer définitivement cette notification ? Cette action est irréversible.'
      : 'Marquer cette notification comme supprimée ?';
    if (!window.confirm(question)) return;

    try {
      if (alreadyDeleted) {
        await removeNotification(congresId, row.id);
        setFeedback({ type: 'success', message: 'Notification supprimée définitivement.' });
      } else {
        await markNotificationStatus(congresId, row.id, 'deleted');
        setFeedback({ type: 'success', message: 'Notification marquée comme supprimée.' });
      }
    } catch (deleteError: any) {
      setFeedback({ type: 'error', message: deleteError?.message ?? String(deleteError) });
    }
  }

  const isEditing = form.id != null;

  return (
    <div className="config-card notifications-card">
      <div className="notifications-header">
        <div>
          <h2>Notifications</h2>
          <p className="notifications-subtitle">Planifiez et suivez les notifications envoyées aux participants.</p>
        </div>
        <button
          type="button"
          className="btn-primary notifications-add"
          onClick={openCreateModal}
          disabled={!isAdmin}
        >
          + Ajouter une notification
        </button>
      </div>

      {feedback && <div className={`notifications-feedback ${feedback.type}`}>{feedback.message}</div>}
      {error && <div className="notifications-feedback error">{error}</div>}

      <div className="notifications-table-wrapper">
        {loading ? (
          <div className="notifications-empty">Chargement des notifications...</div>
        ) : rows.length === 0 ? (
          <div className="notifications-empty">Aucune notification planifiée pour le moment.</div>
        ) : (
          <table className="notifications-table">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Heure</th>
                <th>Titre</th>
                <th>Message</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = row.status ?? STATUS_FALLBACK;
                return (
                  <tr key={row.id} className={status === 'deleted' ? 'is-deleted' : ''}>
                    <td>{getRowDay(row)}</td>
                    <td>{getRowTime(row)}</td>
                    <td className="notifications-title-cell">{row.title}</td>
                    <td className="notifications-message-cell">{row.message}</td>
                    <td>
                      <span className={`status-pill ${STATUS_VARIANTS[status]}`}>{STATUS_LABELS[status]}</span>
                    </td>
                    <td className="notifications-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => openEditModal(row)}
                        disabled={!isAdmin}
                        title="Modifier la notification"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() => handleDelete(row)}
                        disabled={!isAdmin}
                        title={status === 'deleted' ? 'Supprimer définitivement' : 'Supprimer'}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="config-footer">
        <button type="button" className="btn-outline" onClick={onBack}>
          Retour
        </button>
        {onNext && (
          <button type="button" className="btn-next" onClick={onNext}>
            Suivant
          </button>
        )}
      </div>

      {modalOpen && (
        <div
          className="notifications-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className="notifications-modal" role="dialog" aria-modal="true">
            <header className="notifications-modal-header">
              <h3>{isEditing ? 'Modifier la notification' : 'Ajouter une notification'}</h3>
              <button type="button" className="icon-btn" onClick={closeModal} aria-label="Fermer">
                ×
              </button>
            </header>
            <form className="notifications-form" onSubmit={handleSubmit}>
              <label className="field-group">
                <span>Titre</span>
                <input
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  placeholder="Titre de la notification"
                />
              </label>

              <div className="notifications-grid">
                <label className="field-group">
                  <span>Date d&apos;envoi</span>
                  <input
                    type="date"
                    value={form.scheduledDate}
                    onChange={(event) => updateField('scheduledDate', event.target.value)}
                  />
                </label>
                <label className="field-group">
                  <span>Heure d&apos;envoi</span>
                  <input
                    type="time"
                    value={form.scheduledTime}
                    onChange={(event) => updateField('scheduledTime', event.target.value)}
                  />
                </label>
              </div>

              <label className="field-group">
                <span>Message</span>
                <textarea
                  rows={4}
                  value={form.message}
                  onChange={(event) => updateField('message', event.target.value)}
                  placeholder="Contenu du message..."
                />
              </label>

              {isEditing && (
                <label className="field-group">
                  <span>Statut</span>
                  <select
                    value={form.status}
                    onChange={(event) => updateField('status', event.target.value as NotificationStatus)}
                  >
                    <option value="scheduled">Programmé</option>
                    <option value="sent">Envoyé</option>
                    <option value="deleted">Supprimé</option>
                  </select>
                </label>
              )}

              <div className="notifications-modal-actions">
                <button type="button" className="btn-outline" onClick={closeModal}>
                  Annuler
                </button>
                <button className="btn-primary" disabled={saving || !isAdmin}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

type StepId = 'identity' | 'store' | 'notifications' | 'features';

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
  { id: 'notifications', index: 3, label: 'Notifications' },
  { id: 'features', index: 4, label: 'Choix des fonctionnalites', disabled: true },
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

  const identity: AppIdentity = cfg?.identity ?? {};
  const store: AppStoreInfo = cfg?.store ?? { appName: '' };

  const validStore = useMemo(() => !!store.appName?.trim(), [store.appName]);

  const updateIdentity = (patch: Partial<AppIdentity>) => {
    setCfg((current) => {
      const nextIdentity: AppIdentity = { ...(current?.identity ?? {}), ...patch };
      const nextStore: AppStoreInfo = current?.store ?? store;
      return {
        ...(current ?? {}),
        identity: nextIdentity,
        store: nextStore,
      };
    });
  };

  const updateStore = (patch: Partial<AppStoreInfo>) => {
    setCfg((current) => {
      const baseIdentity: AppIdentity = current?.identity ?? identity;
      const baseStore: AppStoreInfo = current?.store ?? store;
      const nextStore: AppStoreInfo = { ...baseStore, ...patch };
      return {
        ...(current ?? {}),
        identity: baseIdentity,
        store: nextStore,
      };
    });
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
              <button type="button" className="btn-next" onClick={() => setTab('notifications')}>
                Suivant
              </button>
            </div>
          </form>
        )}

        {tab === 'notifications' && (
          <NotificationsPanel
            congresId={congresId}
            isAdmin={isAdmin}
            onBack={() => setTab('store')}
            onNext={() => setTab('features')}
          />
        )}

        {tab === 'features' && (
          <div className="config-card">
            <h2>Choix des fonctionnalites</h2>
            <div className="features-placeholder">En cours de reflexion</div>
            <div className="config-footer">
              <button type="button" className="btn-outline" onClick={() => setTab('notifications')}>
                Retour
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
