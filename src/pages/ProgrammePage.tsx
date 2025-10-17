import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCongresId } from '../lib/congresId';
import { watchCongres, updateCongres } from '../firestore/firestoreApi';
import { stripUndefined } from '../lib/stripUndefined';
import type { ProgrammeItem, ProgrammePresentation, ProgrammeSpeaker } from '../firestore/schema';
import './programme.css';

type SessionModalState = {
  mode: 'create' | 'edit';
  index: number;
  session: ProgrammeItem;
};

type PresentationModalState = {
  mode: 'create' | 'edit';
  sessionIndex: number;
  presentationIndex: number;
  presentation: ProgrammePresentation;
};

type ModeratorForm = {
  id?: string;
  prenom: string;
  nom: string;
  ville: string;
};

type SessionForm = {
  id?: string;
  displayTitle: string;
  title: string;
  date: string;
  start: string;
  end: string;
  room: string;
  sessionCode: string;
  ajouterAgenda: boolean;
  moderators: ModeratorForm[];
};

type PresentationForm = {
  id?: string;
  displayTitle: string;
  subtitle: string;
  date: string;
  start: string;
  end: string;
  room: string;
  description: string;
  speakers: ModeratorForm[];
};

function makeNewProgramme(): ProgrammeItem {
  return {
    id: `programme_${Date.now()}`,
    displayTitle: 'Nouvelle session',
    ajouterAgenda: false,
    presentations: [],
    maitresDeConference: [],
  };
}

function makeNewPresentation(): ProgrammePresentation {
  return {
    id: `presentation_${Date.now()}`,
    displayTitle: 'Nouvelle presentation',
    description: '',
    maitresDeConference: [],
  };
}

function getProgrammeKey(programme: ProgrammeItem, index: number) {
  return programme.id ?? `programme-${index}`;
}

function asStringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'seconds' in (value as any) && 'nanoseconds' in (value as any)) {
    const ts = value as { seconds: number; nanoseconds: number };
    const date = new Date(ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000));
    return date.toISOString();
  }
  return String(value);
}

function formatDateLabel(value: unknown): string {
  const raw = asStringValue(value);
  if (!raw) return '';
  try {
    const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('fr-FR');
    }
  } catch {
    // ignore parsing error
  }
  return raw;
}

function formatTimeLabel(value: unknown): string {
  const raw = asStringValue(value);
  if (!raw) return '';
  try {
    const date = raw.includes('T') ? new Date(raw) : new Date(`1970-01-01T${raw}`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
  } catch {
    // ignore parsing error
  }
  return raw;
}

function toModeratorForm(speaker?: ProgrammeSpeaker): ModeratorForm {
  return {
    id: speaker?.id ?? '',
    prenom: speaker?.prenom ?? (speaker as any)?.firstName ?? '',
    nom: speaker?.nom ?? (speaker as any)?.lastName ?? '',
    ville: speaker?.lieuDeTravail ?? (speaker as any)?.cityCountry ?? '',
  };
}

function fromModeratorForm(form: ModeratorForm): ProgrammeSpeaker {
  const prenom = form.prenom.trim();
  const nom = form.nom.trim();
  const ville = form.ville.trim();
  const result: ProgrammeSpeaker = {
    ...(form.id ? { id: form.id } : {}),
    prenom,
    nom,
  };
  if (ville) {
    result.lieuDeTravail = ville;
    result.cityCountry = ville;
  }
  return result;
}

function toSessionForm(session: ProgrammeItem): SessionForm {
  return {
    id: session.id,
    displayTitle: session.displayTitle ?? session.title ?? '',
    title: session.title ?? '',
    date: asStringValue(session.date ?? session.dateDebut ?? ''),
    start: asStringValue((session as any).dateDebut ?? ''),
    end: asStringValue((session as any).dateFin ?? ''),
    room: session.lieu ?? '',
    sessionCode: (session as any).Session ?? '',
    ajouterAgenda: Boolean(session.ajouterAgenda),
    moderators: (session.maitresDeConference ?? []).map(toModeratorForm),
  };
}

function fromSessionForm(form: SessionForm, base?: ProgrammeItem): ProgrammeItem {
  const id = base?.id ?? form.id ?? `programme_${Date.now()}`;
  const presentations = base?.presentations ?? [];
  return {
    ...(base ?? {}),
    id,
    displayTitle: form.displayTitle.trim() || undefined,
    title: form.title.trim() || form.displayTitle.trim() || undefined,
    date: form.date.trim() || undefined,
    dateDebut: form.start.trim() || undefined,
    dateFin: form.end.trim() || undefined,
    lieu: form.room.trim() || undefined,
    Session: form.sessionCode.trim() || undefined,
    ajouterAgenda: form.ajouterAgenda,
    maitresDeConference: form.moderators
      .map(fromModeratorForm)
      .filter((speaker) => speaker.prenom || speaker.nom || speaker.id),
    presentations,
  };
}

function toPresentationForm(presentation: ProgrammePresentation): PresentationForm {
  return {
    id: presentation.id,
    displayTitle: presentation.displayTitle ?? presentation.titre ?? '',
    subtitle: presentation.titre ?? '',
    date: asStringValue(presentation.date ?? ''),
    start: asStringValue(presentation.heureDebut ?? ''),
    end: asStringValue(presentation.heureFin ?? ''),
    room: (presentation as any).lieu ?? (presentation as any).room ?? '',
    description: presentation.description ?? '',
    speakers: (presentation.maitresDeConference ?? []).map(toModeratorForm),
  };
}

function fromPresentationForm(form: PresentationForm, base?: ProgrammePresentation): ProgrammePresentation {
  const id = base?.id ?? form.id ?? `presentation_${Date.now()}`;
  const result: ProgrammePresentation = {
    ...(base ?? {}),
    id,
    displayTitle: form.displayTitle.trim() || form.subtitle.trim() || base?.displayTitle,
    titre: form.subtitle.trim() || undefined,
    date: form.date.trim() || undefined,
    heureDebut: form.start.trim() || undefined,
    heureFin: form.end.trim() || undefined,
    description: form.description.trim() || undefined,
    maitresDeConference: form.speakers
      .map(fromModeratorForm)
      .filter((speaker) => speaker.prenom || speaker.nom || speaker.id),
  };
  const room = form.room.trim();
  if (room) {
    (result as any).lieu = room;
  }
  return result;
}

export default function ProgrammePage() {
  const { isAdmin } = useAuth();
  const [congresId, setCongresId] = useCongresId();

  const [programmes, setProgrammes] = useState<ProgrammeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [sessionModal, setSessionModal] = useState<SessionModalState | null>(null);
  const [presentationModal, setPresentationModal] = useState<PresentationModalState | null>(null);

  useEffect(() => {
    const unsubscribe = watchCongres(
      congresId,
      (doc) => {
        const list = (doc?.listProgrammes ?? []) as ProgrammeItem[];
        setProgrammes(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message ?? String(err));
        setLoading(false);
      },
    );
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [congresId]);

  useEffect(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      programmes.forEach((programme, idx) => {
        const key = getProgrammeKey(programme, idx);
        next[key] = prev[key] ?? true;
      });
      return next;
    });
  }, [programmes]);

  const totalPresentations = useMemo(() => {
    return programmes.reduce((acc, programme) => acc + (programme.presentations?.length ?? 0), 0);
  }, [programmes]);

  async function persist(nextList: ProgrammeItem[], message: string) {
    if (!isAdmin) {
      setError('Droits insuffisants.');
      return;
    }
    try {
      const sanitized = stripUndefined(nextList);
      await updateCongres(congresId, { listProgrammes: sanitized });
      setProgrammes(sanitized);
      setStatus(message);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }

  const handleAddSession = () => {
    setSessionModal({ mode: 'create', index: programmes.length, session: makeNewProgramme() });
  };

  const handleEditSession = (index: number) => {
    setSessionModal({ mode: 'edit', index, session: programmes[index] });
  };

  const handleDeleteSession = async (index: number) => {
    if (!window.confirm('Supprimer cette session et ses presentations ?')) return;
    const nextList = programmes.filter((_, idx) => idx !== index);
    await persist(nextList, 'Session supprimee.');
  };

  const handleSessionSubmit = async (session: ProgrammeItem) => {
    if (!sessionModal) return;
    if (sessionModal.mode === 'create') {
      const nextList = [...programmes, session];
      await persist(nextList, 'Session ajoutee.');
    } else {
      const nextList = programmes.map((item, idx) => (idx === sessionModal.index ? session : item));
      await persist(nextList, 'Session mise a jour.');
    }
    setSessionModal(null);
  };

  const handleAddPresentation = (sessionIndex: number) => {
    const presentation = makeNewPresentation();
    setPresentationModal({ mode: 'create', sessionIndex, presentationIndex: (programmes[sessionIndex]?.presentations?.length ?? 0), presentation });
  };

  const handleEditPresentation = (sessionIndex: number, presentationIndex: number) => {
    const presentation = programmes[sessionIndex].presentations?.[presentationIndex];
    if (!presentation) return;
    setPresentationModal({ mode: 'edit', sessionIndex, presentationIndex, presentation });
  };

  const handleDeletePresentation = async (sessionIndex: number, presentationIndex: number) => {
    if (!window.confirm('Supprimer cette presentation ?')) return;
    const session = programmes[sessionIndex];
    const nextPresentations = (session.presentations ?? []).filter((_, idx) => idx !== presentationIndex);
    const nextSession = { ...session, presentations: nextPresentations };
    const nextList = programmes.map((item, idx) => (idx === sessionIndex ? nextSession : item));
    await persist(nextList, 'Presentation supprimee.');
  };

  const handlePresentationSubmit = async (presentation: ProgrammePresentation) => {
    if (!presentationModal) return;
    const { sessionIndex, presentationIndex, mode } = presentationModal;
    const session = programmes[sessionIndex];
    const nextPresentations = [...(session.presentations ?? [])];
    if (mode === 'create') {
      nextPresentations.push(presentation);
    } else {
      nextPresentations[presentationIndex] = presentation;
    }
    const nextSession = { ...session, presentations: nextPresentations };
    const nextList = programmes.map((item, idx) => (idx === sessionIndex ? nextSession : item));
    await persist(nextList, mode === 'create' ? 'Presentation ajoutee.' : 'Presentation mise a jour.');
    setPresentationModal(null);
  };

  const toggleExpanded = (programme: ProgrammeItem, index: number) => {
    const key = getProgrammeKey(programme, index);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="programme-page">
      <header className="programme-header">
        <div className="programme-toolbar">
          <label>
            Congres ID
            <input value={congresId} onChange={(event) => setCongresId(event.target.value)} />
          </label>
          <div className="spacer" />
          <Link className="btn-outline" to="/importation-pdf">Programme PDF</Link>
          <button className="btn-primary" onClick={handleAddSession} disabled={!isAdmin}>+ Ajouter une session</button>
        </div>
        <div className="programme-stats">
          <span>{programmes.length} session(s)</span>
          <span>-</span>
          <span>{totalPresentations} presentation(s)</span>
        </div>
        {status && <div className="status success">{status}</div>}
        {error && <div className="status error">Erreur : {error}</div>}
      </header>

      {loading && <div className="programme-placeholder">Chargement des programmes...</div>}

      {!loading && programmes.length === 0 && (
        <div className="programme-empty">Aucune session enregistree.</div>
      )}

      {!loading && programmes.length > 0 && (
        <div className="session-stack">
          {programmes.map((programme, idx) => {
            const key = getProgrammeKey(programme, idx);
            const isOpen = expanded[key] ?? true;
            const sessionStart = programme.dateDebut ?? programme.presentations?.[0]?.heureDebut;
            const sessionEnd = programme.dateFin ?? programme.presentations?.[programme.presentations?.length - 1]?.heureFin;
            return (
              <article key={key} className={`session-card ${isOpen ? 'open' : 'closed'}`}>
                <div className="session-header">
                  <div className="session-title">
                    <h3>{programme.displayTitle ?? programme.title ?? 'Session sans titre'}</h3>
                    <div className="session-meta">
                      {programme.date && <span>{formatDateLabel(programme.date)}</span>}
                      {sessionStart && <span>{formatTimeLabel(sessionStart)} - {formatTimeLabel(sessionEnd)}</span>}
                      {programme.lieu && <span>{programme.lieu}</span>}
                    </div>
                  </div>
                  <div className="session-actions">
                    <button className="action-btn edit" onClick={() => handleEditSession(idx)} disabled={!isAdmin}>Modifier</button>
                    <button className="action-btn delete" onClick={() => handleDeleteSession(idx)} disabled={!isAdmin}>Supprimer</button>
                    <button className={`action-btn toggle${isOpen ? ' is-open' : ''}`} onClick={() => toggleExpanded(programme, idx)}>{isOpen ? 'Reduire' : 'Deplier'}</button>
                  </div>
                </div>
                {isOpen && (
                  <div className="session-body">
                    {(programme.maitresDeConference?.length ?? 0) > 0 && (
                      <div className="programme-section">
                        <span className="section-label">Moderateurs</span>
                        <ul className="chips">
                          {programme.maitresDeConference?.map((speaker, speakerIdx) => (
                            <li key={speaker.id ?? speakerIdx} className="chip-chip">
                              {(speaker.prenom || speaker.nom) ? `${speaker.prenom ?? ''} ${speaker.nom ?? ''}`.trim() : (speaker.id ?? 'Intervenant')}
                              {speaker.lieuDeTravail ? ` - ${speaker.lieuDeTravail}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="session-controls">
                      <button className="btn-outline" onClick={() => handleAddPresentation(idx)} disabled={!isAdmin}>+ Ajouter une presentation</button>
                    </div>
                    <div className="presentation-list">
                      {(programme.presentations ?? []).length === 0 && (
                        <div className="programme-empty">Aucune presentation ajoutee.</div>
                      )}
                      {(programme.presentations ?? []).map((presentation, presentationIdx) => (
                        <div key={presentation.id ?? presentationIdx} className="presentation-row">
                          <div className="presentation-info">
                            <h4>{presentation.displayTitle ?? presentation.titre ?? `Presentation ${presentationIdx + 1}`}</h4>
                            <div className="presentation-meta">
                              {presentation.date && <span>{formatDateLabel(presentation.date)}</span>}
                              {(presentation.heureDebut || presentation.heureFin) && (
                                <span>
                                  {formatTimeLabel(presentation.heureDebut)}
                                  {(presentation.heureDebut && presentation.heureFin) ? ' - ' : ''}
                                  {formatTimeLabel(presentation.heureFin)}
                                </span>
                              )}
                              {(presentation as any).lieu && <span>{(presentation as any).lieu}</span>}
                            </div>
                            {presentation.maitresDeConference && presentation.maitresDeConference.length > 0 && (
                              <div className="presentation-speakers">
                                <span className="section-label">Intervenants</span>
                                <ul>
                                  {presentation.maitresDeConference.map((speaker, speakerIdx) => (
                                    <li key={speaker.id ?? speakerIdx}>
                                      {(speaker.prenom || speaker.nom) ? `${speaker.prenom ?? ''} ${speaker.nom ?? ''}`.trim() : (speaker.id ?? 'Intervenant')}
                                      {speaker.lieuDeTravail ? ` - ${speaker.lieuDeTravail}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {presentation.description && <p className="presentation-description">{presentation.description}</p>}
                          </div>
                          <div className="presentation-actions">
                            <button className="action-btn edit" onClick={() => handleEditPresentation(idx, presentationIdx)} disabled={!isAdmin}>Modifier</button>
                            <button className="action-btn delete" onClick={() => handleDeletePresentation(idx, presentationIdx)} disabled={!isAdmin}>Supprimer</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <SessionModal
        state={sessionModal}
        onCancel={() => setSessionModal(null)}
        onSubmit={handleSessionSubmit}
      />
      <PresentationModal
        state={presentationModal}
        onCancel={() => setPresentationModal(null)}
        onSubmit={handlePresentationSubmit}
      />
    </div>
  );
}

function SessionModal({ state, onCancel, onSubmit }: {
  state: SessionModalState | null;
  onCancel: () => void;
  onSubmit: (programme: ProgrammeItem) => void;
}) {
  const open = Boolean(state);
  const initial = state?.session ?? makeNewProgramme();
  const [form, setForm] = useState<SessionForm>(toSessionForm(initial));

  useEffect(() => {
    if (open) {
      setForm(toSessionForm(initial));
    }
  }, [open, initial]);

  if (!open) return null;

  const handleChange = (field: keyof SessionForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleModeratorChange = (index: number, field: keyof ModeratorForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      moderators: prev.moderators.map((mod, idx) => (idx === index ? { ...mod, [field]: value } : mod)),
    }));
  };

  const handleAddModerator = () => {
    setForm((prev) => ({
      ...prev,
      moderators: [...prev.moderators, { prenom: '', nom: '', ville: '' }],
    }));
  };

  const handleRemoveModerator = (index: number) => {
    setForm((prev) => ({
      ...prev,
      moderators: prev.moderators.filter((_, idx) => idx !== index),
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const programme = fromSessionForm(form, initial);
    onSubmit(programme);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3>{state?.mode === 'edit' ? 'Modifier la session' : 'Ajouter une session'}</h3>
          <button className="btn-ghost" onClick={onCancel} aria-label="Fermer">x</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <label className="field">
            <span>Titre</span>
            <input value={form.displayTitle} onChange={(event) => handleChange('displayTitle', event.target.value)} placeholder="Titre de la session" required />
          </label>
          <label className="field">
            <span>Sous-titre</span>
            <input value={form.title} onChange={(event) => handleChange('title', event.target.value)} placeholder="Sous-titre (optionnel)" />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Date</span>
              <input value={form.date} onChange={(event) => handleChange('date', event.target.value)} placeholder="JJ/MM/AAAA" />
            </label>
            <label className="field">
              <span>Code session</span>
              <input value={form.sessionCode} onChange={(event) => handleChange('sessionCode', event.target.value)} placeholder="S_1_0" />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Heure de debut</span>
              <input value={form.start} onChange={(event) => handleChange('start', event.target.value)} placeholder="HH:MM" />
            </label>
            <label className="field">
              <span>Heure de fin</span>
              <input value={form.end} onChange={(event) => handleChange('end', event.target.value)} placeholder="HH:MM" />
            </label>
          </div>
          <label className="field">
            <span>Salle / Lieu</span>
            <input value={form.room} onChange={(event) => handleChange('room', event.target.value)} placeholder="Nom de la salle" />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={form.ajouterAgenda} onChange={(event) => handleChange('ajouterAgenda', event.target.checked)} />
            Ajouter automatiquement a l'agenda
          </label>

          <div className="field">
            <div className="field-label">Moderateurs</div>
            <div className="moderator-list">
              {form.moderators.map((moderator, idx) => (
                <div key={idx} className="moderator-row">
                  <input
                    value={moderator.prenom}
                    onChange={(event) => handleModeratorChange(idx, 'prenom', event.target.value)}
                    placeholder="Prenom"
                  />
                  <input
                    value={moderator.nom}
                    onChange={(event) => handleModeratorChange(idx, 'nom', event.target.value)}
                    placeholder="Nom"
                  />
                  <input
                    value={moderator.ville}
                    onChange={(event) => handleModeratorChange(idx, 'ville', event.target.value)}
                    placeholder="Ville/Pays"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => handleRemoveModerator(idx)}
                    aria-label="Supprimer le moderateur"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
              <button type="button" className="btn-outline" onClick={handleAddModerator}>+ Ajouter un moderateur</button>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-outline" onClick={onCancel}>Annuler</button>
            <button type="submit" className="btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PresentationModal({ state, onCancel, onSubmit }: {
  state: PresentationModalState | null;
  onCancel: () => void;
  onSubmit: (presentation: ProgrammePresentation) => void;
}) {
  const open = Boolean(state);
  const initial = state?.presentation ?? makeNewPresentation();
  const [form, setForm] = useState<PresentationForm>(toPresentationForm(initial));

  useEffect(() => {
    if (open) {
      setForm(toPresentationForm(initial));
    }
  }, [open, initial]);

  if (!open) return null;

  const handleChange = (field: keyof PresentationForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSpeakerChange = (index: number, field: keyof ModeratorForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      speakers: prev.speakers.map((speaker, idx) => (idx === index ? { ...speaker, [field]: value } : speaker)),
    }));
  };

  const handleAddSpeaker = () => {
    setForm((prev) => ({
      ...prev,
      speakers: [...prev.speakers, { prenom: '', nom: '', ville: '' }],
    }));
  };

  const handleRemoveSpeaker = (index: number) => {
    setForm((prev) => ({
      ...prev,
      speakers: prev.speakers.filter((_, idx) => idx !== index),
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const presentation = fromPresentationForm(form, initial);
    onSubmit(presentation);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3>{state?.mode === 'edit' ? 'Modifier la presentation' : 'Ajouter une presentation'}</h3>
          <button className="btn-ghost" onClick={onCancel} aria-label="Fermer">x</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <label className="field">
            <span>Titre</span>
            <input value={form.displayTitle} onChange={(event) => handleChange('displayTitle', event.target.value)} placeholder="Titre de la presentation" required />
          </label>
          <label className="field">
            <span>Sous-titre</span>
            <input value={form.subtitle} onChange={(event) => handleChange('subtitle', event.target.value)} placeholder="Sous-titre (optionnel)" />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Date</span>
              <input value={form.date} onChange={(event) => handleChange('date', event.target.value)} placeholder="JJ/MM/AAAA" />
            </label>
            <label className="field">
              <span>Salle / Lieu</span>
              <input value={form.room} onChange={(event) => handleChange('room', event.target.value)} placeholder="Nom de la salle" />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Heure de debut</span>
              <input value={form.start} onChange={(event) => handleChange('start', event.target.value)} placeholder="HH:MM" />
            </label>
            <label className="field">
              <span>Heure de fin</span>
              <input value={form.end} onChange={(event) => handleChange('end', event.target.value)} placeholder="HH:MM" />
            </label>
          </div>
          <label className="field">
            <span>Description</span>
            <textarea value={form.description} onChange={(event) => handleChange('description', event.target.value)} rows={3} placeholder="Description (optionnel)" />
          </label>

          <div className="field">
            <div className="field-label">Intervenants</div>
            <div className="moderator-list">
              {form.speakers.map((speaker, idx) => (
                <div key={idx} className="moderator-row">
                  <input
                    value={speaker.prenom}
                    onChange={(event) => handleSpeakerChange(idx, 'prenom', event.target.value)}
                    placeholder="Prenom"
                  />
                  <input
                    value={speaker.nom}
                    onChange={(event) => handleSpeakerChange(idx, 'nom', event.target.value)}
                    placeholder="Nom"
                  />
                  <input
                    value={speaker.ville}
                    onChange={(event) => handleSpeakerChange(idx, 'ville', event.target.value)}
                    placeholder="Ville/Pays"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => handleRemoveSpeaker(idx)}
                    aria-label="Supprimer l'intervenant"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
              <button type="button" className="btn-outline" onClick={handleAddSpeaker}>+ Ajouter un intervenant</button>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-outline" onClick={onCancel}>Annuler</button>
            <button type="submit" className="btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}



