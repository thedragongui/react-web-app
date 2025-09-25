import { useEffect, useMemo, useState } from 'react';
import {
  watchSessions, watchPresentations,
  type Session, type Presentation, type Moderator,
  createSession, addPresentation,
  updateSession, deleteSessionCascade,
  updatePresentation, deletePresentation
} from '../firestore/firestoreApi';
import { useAuth } from '../auth/AuthContext';
import './programme.css';
import { DEFAULT_CONGRES_ID } from '../lib/congresId';


/* ===== utils ===== */
function formatDate(d: string) {
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
}
function timeRange(start?: string, end?: string) {
  if (!start && !end) return '';
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? '';
}
const isValidDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isValidTime = (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/* ===== Confirm dialog ===== */
function ConfirmDialog({
  open, title, message, confirmLabel = 'Supprimer', onCancel, onConfirm
}: {
  open: boolean; title: string; message: string; confirmLabel?: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal small" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-ghost" onClick={onCancel} aria-label="Fermer">×</button>
        </div>
        <div className="confirm-body">{message}</div>
        <div className="actions">
          <button className="btn-ghost" onClick={onCancel}>Annuler</button>
          <button className="btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ===== Session modal ===== */
function SessionModal({
  open, onClose, onSaved, congresId, defaultOrder, initial
}: {
  open: boolean; onClose: () => void; onSaved: (id?: string) => void;
  congresId: string; defaultOrder: number; initial?: Session | null;
}) {
  const isEdit = !!initial?.id;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [start, setStart] = useState(initial?.start ?? '');
  const [end, setEnd] = useState(initial?.end ?? '');
  const [room, setRoom] = useState(initial?.room ?? '');
  const [moderators, setModerators] = useState<Moderator[]>(initial?.moderators ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setDate(initial?.date ?? '');
      setStart(initial?.start ?? '');
      setEnd(initial?.end ?? '');
      setRoom(initial?.room ?? '');
      setModerators(initial?.moderators ?? []);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initial]);

  function addModerator() {
    setModerators((m) => [...m, { firstName: '', lastName: '', cityCountry: '' }]);
  }
  function updateModerator(i: number, patch: Partial<Moderator>) {
    setModerators((m) => m.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeModerator(i: number) {
    setModerators((m) => m.filter((_, idx) => idx !== i));
  }

  const isFormValid = useMemo(() => {
    if (!title.trim()) return false;
    if (!isValidDate(date)) return false;
    if (!isValidTime(start) || !isValidTime(end)) return false;
    if (toMinutes(start) >= toMinutes(end)) return false;
    if (!room.trim()) return false;
    return true;
  }, [title, date, start, end, room]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) {
      setError('Veuillez corriger les champs requis.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && initial?.id) {
        await updateSession(congresId, initial.id, {
          title: title.trim(),
          date,
          start,
          end,
          room: room.trim(),
          moderators: moderators.filter((m) => m.firstName || m.lastName),
        });
        onSaved(initial.id);
      } else {
        const id = await createSession(congresId, {
          title: title.trim(),
          date,
          start,
          end,
          room: room.trim(),
          moderators: moderators.filter((m) => m.firstName || m.lastName),
          order: defaultOrder,
        });
        onSaved(id);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Éditer la session' : 'Ajouter une session'}>
        <div className="modal-header">
          <h3>{isEdit ? 'Éditer la session' : 'Ajouter une session'}</h3>
          <button className="btn-ghost" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Titre *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Date *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Début *</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              <span>Fin *</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Salle *</span>
            <input value={room} onChange={(e) => setRoom(e.target.value)} />
          </label>

          <div className="field">
            <div className="row-between">
              <span>Modérateurs</span>
              <button type="button" className="btn-ghost" onClick={addModerator}>+ Ajouter un modérateur</button>
            </div>
            <div className="mods">
              {moderators.map((m, i) => (
                <div key={i} className="mod-row">
                  <input placeholder="Prénom" value={m.firstName} onChange={(e) => updateModerator(i, { firstName: e.target.value })} />
                  <input placeholder="Nom" value={m.lastName} onChange={(e) => updateModerator(i, { lastName: e.target.value })} />
                  <input placeholder="Ville/Pays" value={m.cityCountry ?? ''} onChange={(e) => updateModerator(i, { cityCountry: e.target.value })} />
                  <button type="button" className="btn-ghost" onClick={() => removeModerator(i)} aria-label="Supprimer">🗑️</button>
                </div>
              ))}
            </div>
          </div>

          {(!isValidTime(start) || !isValidTime(end) || (start && end && toMinutes(start) >= toMinutes(end))) && (
            <div className="error">L’horaire est invalide (format HH:mm) et l’heure de fin doit être après le début.</div>
          )}
          {error && <div className="error">{error}</div>}

          <div className="actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={!isFormValid || submitting}>
              {submitting ? 'Enregistrement…' : (isEdit ? 'Mettre à jour' : 'Enregistrer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ===== Presentation modal ===== */
function PresentationModal({
  open, onClose, congresId, sessionId, onSaved, initial
}: {
  open: boolean; onClose: () => void; congresId: string; sessionId: string;
  onSaved: (id?: string) => void; initial?: Presentation | null;
}) {
  const isEdit = !!initial?.id;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [start, setStart] = useState(initial?.start ?? '');
  const [end, setEnd] = useState(initial?.end ?? '');
  const [room, setRoom] = useState(initial?.room ?? '');
  const [speakerFirstName, setSpeakerFirstName] = useState(initial?.speakerFirstName ?? '');
  const [speakerLastName, setSpeakerLastName] = useState(initial?.speakerLastName ?? '');
  const [cityCountry, setCityCountry] = useState(initial?.cityCountry ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setStart(initial?.start ?? '');
      setEnd(initial?.end ?? '');
      setRoom(initial?.room ?? '');
      setSpeakerFirstName(initial?.speakerFirstName ?? '');
      setSpeakerLastName(initial?.speakerLastName ?? '');
      setCityCountry(initial?.cityCountry ?? '');
      setError(null);
      setSubmitting(false);
    }
  }, [open, initial]);

  const isFormValid = useMemo(() => {
    if (!title.trim()) return false;
    if (start && !isValidTime(start)) return false;
    if (end && !isValidTime(end)) return false;
    if (start && end && toMinutes(start) >= toMinutes(end)) return false;
    return true;
  }, [title, start, end]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) {
      setError('Veuillez compléter les champs obligatoires.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && initial?.id) {
        await updatePresentation(congresId, sessionId, initial.id, {
          title: title.trim(),
          speakerFirstName: speakerFirstName.trim(),
          speakerLastName: speakerLastName.trim(),
          cityCountry: cityCountry.trim() || undefined,
          start: start || undefined,
          end: end || undefined,
          room: room.trim() || undefined,
        });
        onSaved(initial.id);
      } else {
        const id = await addPresentation(congresId, sessionId, {
          title: title.trim(),
          speakerFirstName: speakerFirstName.trim(),
          speakerLastName: speakerLastName.trim(),
          cityCountry: cityCountry.trim() || undefined,
          start: start || undefined,
          end: end || undefined,
          room: room.trim() || undefined,
        });
        onSaved(id);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Éditer la présentation' : 'Ajouter une présentation'}>
        <div className="modal-header">
          <h3>{isEdit ? 'Éditer la présentation' : 'Ajouter une présentation'}</h3>
          <button className="btn-ghost" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Titre *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de la présentation" required />
          </label>

          <label className="field">
            <span>Salle</span>
            <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="(optionnel)" />
          </label>

          <div className="grid-2">
            <label className="field">
              <span>Prénom</span>
              <input value={speakerFirstName} onChange={(e) => setSpeakerFirstName(e.target.value)} />
            </label>
            <label className="field">
              <span>Nom</span>
              <input value={speakerLastName} onChange={(e) => setSpeakerLastName(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Ville/Pays</span>
            <input value={cityCountry} onChange={(e) => setCityCountry(e.target.value)} placeholder="Paris, France" />
          </label>

          <div className="grid-2">
            <label className="field">
              <span>Début</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              <span>Fin</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>

          {((start && !isValidTime(start)) || (end && !isValidTime(end)) || (start && end && toMinutes(start) >= toMinutes(end))) && (
            <div className="error">Heures invalides (format HH:mm) et la fin doit être après le début.</div>
          )}
          {error && <div className="error">{error}</div>}

          <div className="actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={!isFormValid || submitting}>
              {submitting ? 'Enregistrement…' : (isEdit ? 'Mettre à jour' : 'Enregistrer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ===== list component ===== */
function PresentationList({
  congresId, sessionId, canEdit, onEdit, onDelete
}: {
  congresId: string; sessionId: string; canEdit: boolean;
  onEdit: (p: Presentation) => void; onDelete: (p: Presentation) => void;
}) {
  const [rows, setRows] = useState<Presentation[]>([]);

  useEffect(() => {
    const unsub = watchPresentations(congresId, sessionId, setRows);
    return () => unsub();
  }, [congresId, sessionId]);

  if (rows.length === 0) return <div className="pres-empty">Aucune présentation</div>;

  return (
    <ul className="pres-list">
      {rows.map((p) => (
        <li key={p.id} className="pres-item">
          <div className="pres-index">{String(p.index).padStart(2, '0')}.</div>
          <div className="pres-body">
            <div className="pres-title">{p.title}</div>
            <div className="pres-meta">
              {timeRange(p.start, p.end)}{p.room ? ` • ${p.room}` : ''}
              {(p.speakerFirstName || p.speakerLastName) && (
                <> – <span className="speaker">{p.speakerFirstName} {p.speakerLastName}{p.cityCountry ? `, ${p.cityCountry}` : ''}</span></>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="row-actions">
              <button className="btn-ghost sm" onClick={() => onEdit(p)} aria-label="Éditer">✏️</button>
              <button className="btn-ghost sm danger" onClick={() => onDelete(p)} aria-label="Supprimer">🗑️</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function SessionCard({
  congresId, s, canEdit, onEdit, onDelete, onAddPresentation, onEditPresentation, onDeletePresentation
}: {
  congresId: string; s: Session; canEdit: boolean;
  onEdit: (session: Session) => void; onDelete: (session: Session) => void;
  onAddPresentation: (sessionId: string) => void;
  onEditPresentation: (sessionId: string, p: Presentation) => void;
  onDeletePresentation: (sessionId: string, p: Presentation) => void;
}) {
  return (
    <article className="session-card">
      <header className="session-header">
        <div className="row-between">
          <div>
            <div className="session-title">{s.title}</div>
            <div className="session-info">
              <span>{formatDate(s.date)}</span><span>•</span>
              <span>{s.start} – {s.end}</span>
              {s.room && (<><span>•</span><span>{s.room}</span></>)}
            </div>
          </div>
          {canEdit && (
            <div className="row-actions">
              <button className="btn-ghost sm" onClick={() => onEdit(s)} aria-label="Éditer">✏️</button>
              <button className="btn-ghost sm danger" onClick={() => onDelete(s)} aria-label="Supprimer">🗑️</button>
            </div>
          )}
        </div>

        {s.moderators?.length > 0 && (
          <div className="session-moderators">
            Modérateurs : {s.moderators.map((m, i) => (
              <span key={i}>{m.firstName} {m.lastName}{m.cityCountry ? `, ${m.cityCountry}` : ''}{i < s.moderators.length - 1 ? ' • ' : ''}</span>
            ))}
          </div>
        )}
        {canEdit && (
          <div style={{ marginTop: 8 }}>
            <button className="btn-primary" onClick={() => onAddPresentation(s.id!)}>+ Ajouter une présentation</button>
          </div>
        )}
      </header>

      <PresentationList
        congresId={congresId}
        sessionId={s.id!}
        canEdit={canEdit}
        onEdit={(p) => onEditPresentation(s.id!, p)}
        onDelete={(p) => onDeletePresentation(s.id!, p)}
      />
    </article>
  );
}

export default function ProgrammePage() {
  const { isAdmin } = useAuth();
  const [congresId, setCongresId] = useState(DEFAULT_CONGRES_ID);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Session modal state
  const [openSessionModal, setOpenSessionModal] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);

  // Presentation modal state
  const [openPresModal, setOpenPresModal] = useState(false);
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  const [editingPres, setEditingPres] = useState<Presentation | null>(null);

  // Confirm dialogs
  const [confirmSession, setConfirmSession] = useState<Session | null>(null);
  const [confirmPres, setConfirmPres] = useState<{ sessionId: string; pres: Presentation } | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = watchSessions(congresId, (rows) => {
      setSessions(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [congresId]);

  function openCreateSession() {
    setEditingSession(null);
    setOpenSessionModal(true);
  }
  function openEditSession(s: Session) {
    setEditingSession(s);
    setOpenSessionModal(true);
  }
  function askDeleteSession(s: Session) {
    setConfirmSession(s);
  }

  function openCreatePresentation(sessionId: string) {
    setTargetSessionId(sessionId);
    setEditingPres(null);
    setOpenPresModal(true);
  }
  function openEditPresentation(sessionId: string, p: Presentation) {
    setTargetSessionId(sessionId);
    setEditingPres(p);
    setOpenPresModal(true);
  }
  function askDeletePresentation(sessionId: string, p: Presentation) {
    setConfirmPres({ sessionId, pres: p });
  }

  return (
    <div>
      <div className="toolbar">
        <label>
          Congrès ID&nbsp;
          <input value={congresId} onChange={(e) => setCongresId(e.target.value)} />
        </label>
        <div style={{ flex: 1 }} />
        {isAdmin && <button className="btn-primary" onClick={openCreateSession}>+ Ajouter une session</button>}
      </div>

      {loading && <div className="placeholder">Chargement du programme…</div>}
      {!loading && sessions.length === 0 && <div className="empty-state">Aucun programme</div>}

      <div className="session-list">
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            congresId={congresId}
            s={s}
            canEdit={isAdmin}
            onEdit={openEditSession}
            onDelete={askDeleteSession}
            onAddPresentation={openCreatePresentation}
            onEditPresentation={openEditPresentation}
            onDeletePresentation={askDeletePresentation}
          />
        ))}
      </div>

      <SessionModal
        open={openSessionModal}
        onClose={() => setOpenSessionModal(false)}
        onSaved={() => {}}
        congresId={congresId}
        defaultOrder={(sessions?.length ?? 0) + 1}
        initial={editingSession ?? undefined}
      />
      <PresentationModal
        open={openPresModal}
        onClose={() => setOpenPresModal(false)}
        congresId={congresId}
        sessionId={targetSessionId ?? ''}
        onSaved={() => {}}
        initial={editingPres ?? undefined}
      />

      <ConfirmDialog
        open={!!confirmSession}
        title="Supprimer la session ?"
        message="Cette action supprimera aussi toutes les présentations associées."
        confirmLabel="Supprimer définitivement"
        onCancel={() => setConfirmSession(null)}
        onConfirm={async () => {
          if (!confirmSession?.id) return;
          await deleteSessionCascade(congresId, confirmSession.id);
          setConfirmSession(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmPres}
        title="Supprimer la présentation ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        onCancel={() => setConfirmPres(null)}
        onConfirm={async () => {
          if (!confirmPres) return;
          await deletePresentation(congresId, confirmPres.sessionId, confirmPres.pres.id!);
          setConfirmPres(null);
        }}
      />
    </div>
  );
}
