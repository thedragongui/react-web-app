import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  watchParticipants,
  watchCongres,
  getParticipantRootDoc,
  listParticipantRootSubcollection,
  createParticipant,
  upsertParticipant,
  deleteParticipant,
  type Participant,
  type Congres,
  type ParticipantRootDoc,
  type ParticipantRootSubRow,
} from '../firestore/firestoreApi';
import './participants.css';
import { DEFAULT_CONGRES_ID } from '../lib/congresId';

type Row = Participant & { idDoc: string };

const NEW_PARTICIPANT_ID = '__new__';

type ParticipantFormState = {
  id: string;
  idDoc: string;
  prenom: string;
  nom: string;
  email: string;
  compagnie: string;
  pays: string;
  category: string;
  isAdmin: boolean;
  alreadyScanned: boolean;
};

type ActionState = {
  saving: boolean;
  deleting: boolean;
  error: string | null;
  success: string | null;
};

function makeEmptyForm(): ParticipantFormState {
  return {
    id: '',
    idDoc: '',
    prenom: '',
    nom: '',
    email: '',
    compagnie: '',
    pays: '',
    category: '',
    isAdmin: false,
    alreadyScanned: false,
  };
}

function buildParticipantPayload(form: ParticipantFormState): Partial<Participant> {
  const trimmed = (value: string) => value.trim();
  const payload: Partial<Participant> = {
    id: trimmed(form.id) || undefined,
    prenom: trimmed(form.prenom) || undefined,
    nom: trimmed(form.nom) || undefined,
    email: trimmed(form.email) || undefined,
    compagnie: trimmed(form.compagnie) || undefined,
    pays: trimmed(form.pays) || undefined,
    category: trimmed(form.category) || undefined,
    isAdmin: form.isAdmin,
    alreadyScanned: form.alreadyScanned,
  };
  Object.keys(payload).forEach((key) => {
    if ((payload as any)[key] === undefined) {
      delete (payload as any)[key];
    }
  });
  return payload;
}

const initialActionState: ActionState = { saving: false, deleting: false, error: null, success: null };

const PAGE_SIZE = 25;

function displayName(p: Row) {
  // essaie plusieurs conventions possibles
  const f = (p as any).firstName ?? (p as any).prenom ?? '';
  const l = (p as any).lastName ?? (p as any).nom ?? '';
  const full = `${f} ${l}`.trim();
  if (full) return full;
  if (p['name']) return String(p['name']);
  if (p.email) return p.email.split('@')[0];
  return p.id ?? p.idDoc;
}

function compareById(a: Row, b: Row) {
  const ai = parseInt(String(a.id ?? ''), 10);
  const bi = parseInt(String(b.id ?? ''), 10);
  if (!isNaN(ai) && !isNaN(bi)) return ai - bi;
  return String(a.id ?? a.idDoc).localeCompare(String(b.id ?? b.idDoc));
}

export default function ParticipantsPage() {
  const [congresId, setCongresId] = useState(DEFAULT_CONGRES_ID);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [onlyAdmins, setOnlyAdmins] = useState(false);
  const [onlyScanned, setOnlyScanned] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  // Selection / details
  const [selectedId, setSelectedId] = useState('');
  const [congresData, setCongresData] = useState<(Congres & { id: string }) | null>(null);
  const [congresError, setCongresError] = useState<string | null>(null);
  const [rootDoc, setRootDoc] = useState<ParticipantRootDoc | null>(null);
  const [rootSubRows, setRootSubRows] = useState<ParticipantRootSubRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [formState, setFormState] = useState<ParticipantFormState>(() => makeEmptyForm());
  const [actionState, setActionState] = useState<ActionState>(initialActionState);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = watchParticipants(congresId, (incoming) => {
      const sorted = [...incoming].sort(compareById);
      setRows(sorted);
      setLoading(false);
      setPage(1); // reset page quand on change de dataset
    });
    return () => unsub();
  }, [congresId]);

  useEffect(() => {
    setCongresError(null);
    setCongresData(null);
    const unsub = watchCongres(
      congresId,
      (doc) => {
        setCongresData(doc);
      },
      (err: any) => {
        setCongresError(err?.message ?? String(err));
      },
    );
    return () => {
      unsub();
    };
  }, [congresId]);

  // debounce recherche
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (selectedId === NEW_PARTICIPANT_ID) return;
    if (pendingId && selectedId === pendingId && !rows.some(r => r.idDoc === pendingId)) {
      return;
    }
    if (rows.length === 0) {
      if (selectedId !== '') setSelectedId('');
      return;
    }
    if (!selectedId) {
      setSelectedId(rows[0].idDoc);
      return;
    }
    if (!rows.some(r => r.idDoc === selectedId)) {
      setSelectedId(rows[0].idDoc);
    }
  }, [rows, selectedId, pendingId]);

  useEffect(() => {
    if (pendingId && rows.some(r => r.idDoc === pendingId)) {
      setPendingId(null);
    }
  }, [pendingId, rows]);

  const selectedRow = useMemo(() => {
    if (selectedId === NEW_PARTICIPANT_ID) return null;
    return rows.find(r => r.idDoc === selectedId) ?? null;
  }, [rows, selectedId]);

  useEffect(() => {
    setDetailError(null);
    if (!selectedRow) {
      setDetailLoading(false);
      setRootDoc(null);
      setRootSubRows([]);
      return;
    }
    const row = selectedRow;
    let cancelled = false;
    async function loadDetails() {
      setDetailLoading(true);
      const participantKey = String(row.id ?? row.idDoc);
      const [rootDocRes, subRes] = await Promise.allSettled([
        getParticipantRootDoc(participantKey),
        listParticipantRootSubcollection(participantKey, congresId),
      ]);
      if (cancelled) return;
      let nextError: string | null = null;
      if (rootDocRes.status === 'fulfilled') {
        setRootDoc(rootDocRes.value);
      } else {
        setRootDoc(null);
        nextError = rootDocRes.reason?.message ?? String(rootDocRes.reason ?? '');
      }
      if (subRes.status === 'fulfilled') {
        setRootSubRows(subRes.value);
      } else {
        setRootSubRows([]);
        const message = subRes.reason?.message ?? String(subRes.reason ?? '');
        nextError = nextError ? `${nextError} | ${message}` : message;
      }
      setDetailError(nextError);
      setDetailLoading(false);
    }
    loadDetails().catch((err) => {
      if (cancelled) return;
      setRootDoc(null);
      setRootSubRows([]);
      setDetailError(err?.message ?? String(err));
      setDetailLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRow, congresId]);

  useEffect(() => {
    setActionState(() => ({ ...initialActionState }));
    if (selectedId === NEW_PARTICIPANT_ID) {
      setFormState(makeEmptyForm());
      return;
    }
    if (selectedRow) {
      setFormState({
        id: selectedRow.id != null ? String(selectedRow.id) : '',
        idDoc: selectedRow.idDoc,
        prenom: selectedRow.prenom ? String(selectedRow.prenom) : '',
        nom: selectedRow.nom ? String(selectedRow.nom) : '',
        email: selectedRow.email ?? '',
        compagnie: selectedRow.compagnie ? String(selectedRow.compagnie) : '',
        pays: selectedRow.pays ? String(selectedRow.pays) : '',
        category: selectedRow.category ? String(selectedRow.category) : '',
        isAdmin: !!selectedRow.isAdmin,
        alreadyScanned: !!selectedRow.alreadyScanned,
      });
    } else {
      setFormState(makeEmptyForm());
    }
  }, [selectedId, selectedRow]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.category) set.add(String(r.category)); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    let data = rows;

    if (category !== 'ALL') {
      data = data.filter(r => String(r.category) === category);
    }
    if (onlyAdmins) {
      data = data.filter(r => !!r.isAdmin);
    }
    if (onlyScanned) {
      data = data.filter(r => !!r.alreadyScanned);
    }
    if (debouncedQ) {
      data = data.filter(r => {
        const hay =
          `${displayName(r)} ${r.email ?? ''} ${r.compagnie ?? ''} ${r.pays ?? ''} ${r.id ?? ''}`
            .toLowerCase();
        return hay.includes(debouncedQ);
      });
    }
    return data;
  }, [rows, category, onlyAdmins, onlyScanned, debouncedQ]);

  const isCreating = selectedId === NEW_PARTICIPANT_ID;

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormState(prev => ({
      ...prev,
      [name as keyof ParticipantFormState]: value,
    }));
  };

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setFormState(prev => ({
      ...prev,
      [name as keyof ParticipantFormState]: checked,
    }));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionState(() => ({ ...initialActionState, saving: true }));
    try {
      const payload = buildParticipantPayload(formState);
      if (isCreating) {
        const createdId = await createParticipant(
          congresId.trim(),
          payload,
          formState.idDoc.trim() || undefined,
        );
        setActionState(() => ({ ...initialActionState, success: 'Participant cree avec succes.' }));
        setPendingId(createdId);
        setSelectedId(createdId);
      } else if (selectedRow) {
        await upsertParticipant(congresId.trim(), selectedRow.idDoc, payload);
        setPendingId(null);
        setActionState(() => ({ ...initialActionState, success: 'Participant mis a jour.' }));
      }
    } catch (err: any) {
      setPendingId(null);
      setActionState(() => ({
        ...initialActionState,
        error: err?.message ?? String(err),
      }));
    }
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    const confirmDelete = window.confirm('Supprimer ce participant ?');
    if (!confirmDelete) return;
    setActionState(() => ({ ...initialActionState, deleting: true }));
    try {
      await deleteParticipant(congresId.trim(), selectedRow.idDoc);
      setActionState(() => ({ ...initialActionState, success: 'Participant supprime.' }));
      setPendingId(null);
      setSelectedId('');
    } catch (err: any) {
      setActionState(() => ({
        ...initialActionState,
        error: err?.message ?? String(err),
      }));
    }
  };

  const handleCancelCreate = () => {
    setActionState(() => ({ ...initialActionState }));
    setPendingId(null);
    if (rows.length > 0) {
      setSelectedId(rows[0].idDoc);
    } else {
      setSelectedId('');
      setFormState(makeEmptyForm());
    }
  };

  const handleStartCreate = () => {
    setActionState(() => ({ ...initialActionState }));
    setFormState(makeEmptyForm());
    setPendingId(null);
    setSelectedId(NEW_PARTICIPANT_ID);
  };

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const start = (pageSafe - 1) * PAGE_SIZE;
  const current = filtered.slice(start, start + PAGE_SIZE);
  const participantKey = isCreating
    ? 'nouveau'
    : selectedRow ? String(selectedRow.id ?? selectedRow.idDoc) : '';

  return (
    <div className="ppage">
      <div className="ppage-toolbar">
        <label>
          Congres ID
          <input value={congresId} onChange={(e) => setCongresId(e.target.value)} />
        </label>

        <div className="sep" />

        <input
          className="search"
          placeholder="Rechercher (nom, email, compagnie, pays, id)."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="ALL">Toutes categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="chk">
          <input type="checkbox" checked={onlyAdmins} onChange={e => setOnlyAdmins(e.target.checked)} />
          Admins seulement
        </label>

        <label className="chk">
          <input type="checkbox" checked={onlyScanned} onChange={e => setOnlyScanned(e.target.checked)} />
          Deja scannes
        </label>

        <div className="spacer" />

        <button
          className="btn-primary"
          type="button"
          onClick={handleStartCreate}
        >
          Ajouter un participant
        </button>

        <div className="count">
          {loading ? 'Chargement...' : `${total} resultat${total > 1 ? 's' : ''}`}
        </div>
      </div>

      <div className="ptable">
        <div className="thead">
          <div className="th id">ID</div>
          <div className="th name">Nom</div>
          <div className="th email">Email</div>
          <div className="th comp">Compagnie</div>
          <div className="th country">Pays</div>
          <div className="th cat">Categorie</div>
          <div className="th flag">Admin</div>
          <div className="th flag">Scanne</div>
        </div>

        {loading && <div className="tloading">Chargement des participants...</div>}

        {!loading && current.length === 0 && (
          <div className="tempty">Aucun participant trouve.</div>
        )}

        {!loading && current.length > 0 && (
          <div className="tbody">
            {current.map((r) => (
              <div
                key={r.idDoc}
                className={`tr ${selectedId === r.idDoc ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(r.idDoc)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(r.idDoc);
                  }
                }}
              >
                <div className="td id mono">{r.id ?? r.idDoc}</div>
                <div className="td name">{displayName(r)}</div>
                <div className="td email">
                  {r.email ? (
                    <a href={`mailto:${r.email}`} title="Envoyer un email">{r.email}</a>
                  ) : <span className="muted">-</span>}
                </div>
                <div className="td comp">{r.compagnie ?? <span className="muted">-</span>}</div>
                <div className="td country">{r.pays ?? <span className="muted">-</span>}</div>
                <div className="td cat">{r.category ?? <span className="muted">-</span>}</div>
                <div className="td flag">{r.isAdmin ? 'Oui' : 'Non'}</div>
                <div className="td flag">{r.alreadyScanned ? 'Oui' : 'Non'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pager">
        <button
          className="btn-ghost"
          disabled={pageSafe <= 1}
          onClick={() => setPage(p => Math.max(1, p - 1))}
        >
          <span aria-hidden="true">&lt; </span>Precedent
        </button>
        <div className="page-indicator">
          Page {pageSafe} / {pages}
        </div>
        <button
          className="btn-ghost"
          disabled={pageSafe >= pages}
          onClick={() => setPage(p => Math.min(pages, p + 1))}
        >
          Suivant <span aria-hidden="true">&gt;</span>
        </button>
      </div>

      <div className="pdetails">
        <section className="pdetail-card">
          <div className="pdetail-header">
            <h3>Document congres/{congresId}</h3>
            {congresError && <span className="pdetail-badge error">Erreur</span>}
          </div>
          {congresError && <div className="pdetail-error">{congresError}</div>}
          <pre className="json-viewer">
            {congresData ? JSON.stringify(congresData, null, 2) : 'Aucune donnee'}
          </pre>
        </section>

        <section className="pdetail-card">
          <div className="pdetail-header">
            <h3>{isCreating ? 'Nouveau participant' : 'Participant selectionne'}</h3>
            {isCreating && <span className="pdetail-badge">Mode creation</span>}
            {!isCreating && selectedRow && (
              <span className="pdetail-badge">ID doc: {selectedRow.idDoc}</span>
            )}
          </div>
          <form className="participant-form" onSubmit={handleSave}>
            <div className="form-grid">
              {isCreating && (
                <label>
                  ID document
                  <input
                    name="idDoc"
                    value={formState.idDoc}
                    onChange={handleFieldChange}
                    placeholder="Laisser vide pour auto"
                  />
                </label>
              )}
              <label>
                Champ id
                <input
                  name="id"
                  value={formState.id}
                  onChange={handleFieldChange}
                  placeholder="Identifiant visible"
                />
              </label>
              <label>
                Prenom
                <input
                  name="prenom"
                  value={formState.prenom}
                  onChange={handleFieldChange}
                />
              </label>
              <label>
                Nom
                <input
                  name="nom"
                  value={formState.nom}
                  onChange={handleFieldChange}
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  value={formState.email}
                  onChange={handleFieldChange}
                />
              </label>
              <label>
                Compagnie
                <input
                  name="compagnie"
                  value={formState.compagnie}
                  onChange={handleFieldChange}
                />
              </label>
              <label>
                Pays
                <input
                  name="pays"
                  value={formState.pays}
                  onChange={handleFieldChange}
                />
              </label>
              <label>
                Categorie
                <input
                  name="category"
                  value={formState.category}
                  onChange={handleFieldChange}
                />
              </label>
            </div>

            <div className="form-checkboxes">
              <label>
                <input
                  type="checkbox"
                  name="isAdmin"
                  checked={formState.isAdmin}
                  onChange={handleCheckboxChange}
                />
                Admin
              </label>
              <label>
                <input
                  type="checkbox"
                  name="alreadyScanned"
                  checked={formState.alreadyScanned}
                  onChange={handleCheckboxChange}
                />
                Deja scanne
              </label>
            </div>

            {actionState.error && <div className="form-alert error">{actionState.error}</div>}
            {actionState.success && <div className="form-alert success">{actionState.success}</div>}

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={actionState.saving}>
                {actionState.saving ? 'Enregistrement...' : isCreating ? 'Creer' : 'Enregistrer'}
              </button>
              {!isCreating && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleDelete}
                  disabled={actionState.deleting || actionState.saving}
                >
                  {actionState.deleting ? 'Suppression...' : 'Supprimer'}
                </button>
              )}
              {isCreating && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={handleCancelCreate}
                  disabled={actionState.saving}
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
          {!isCreating && selectedRow && (
            <details className="json-details">
              <summary>Donnees brutes</summary>
              <pre className="json-viewer">{JSON.stringify(selectedRow, null, 2)}</pre>
            </details>
          )}
          {isCreating && (
            <div className="pdetail-empty">Remplissez le formulaire puis cliquez sur Creer.</div>
          )}
          {!isCreating && !selectedRow && (
            <div className="pdetail-empty">Selectionnez un participant dans la liste.</div>
          )}
        </section>

        <section className="pdetail-card">
          <div className="pdetail-header">
            <h3>participants/{participantKey || '...'}</h3>
            {detailLoading && <span className="pdetail-badge">Chargement...</span>}
          </div>
          {detailError && <div className="pdetail-error">{detailError}</div>}
          {selectedRow ? (
            <>
              <div className="pdetail-block">
                <strong className="pdetail-title">Document racine</strong>
                {rootDoc ? (
                  <pre className="json-viewer">{JSON.stringify(rootDoc, null, 2)}</pre>
                ) : (
                  <div className="pdetail-empty">Aucune donnee trouvee.</div>
                )}
              </div>
              <div className="pdetail-block">
                <strong className="pdetail-title">Sous-collection {congresId}</strong>
                {rootSubRows.length > 0 ? (
                  <pre className="json-viewer">{JSON.stringify(rootSubRows, null, 2)}</pre>
                ) : (
                  <div className="pdetail-empty">Aucune donnee trouvee.</div>
                )}
              </div>
            </>
          ) : isCreating ? (
            <div className="pdetail-empty">Creez un participant pour afficher ces donnees.</div>
          ) : (
            <div className="pdetail-empty">Selectionnez un participant dans la liste.</div>
          )}
        </section>
      </div>
    </div>
  );
}
