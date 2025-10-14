import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
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
const PAGE_SIZE = 25;

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

type ParticipantsFilters = {
  query: string;
  category: string;
  onlyAdmins: boolean;
  onlyScanned: boolean;
};

const DEFAULT_FILTERS: ParticipantsFilters = {
  query: '',
  category: 'ALL',
  onlyAdmins: false,
  onlyScanned: false,
};

const initialActionState: ActionState = { saving: false, deleting: false, error: null, success: null };

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

function displayName(p: Row) {
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

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function useParticipantsData(congresId: string) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = watchParticipants(congresId, (incoming) => {
      const sorted = [...incoming].sort(compareById);
      setRows(sorted);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [congresId]);

  return { rows, loading };
}

function useCongresDocument(congresId: string) {
  const [congresData, setCongresData] = useState<(Congres & { id: string }) | null>(null);
  const [congresError, setCongresError] = useState<string | null>(null);

  useEffect(() => {
    setCongresError(null);
    setCongresData(null);
    const unsubscribe = watchCongres(
      congresId,
      (doc) => {
        setCongresData(doc);
      },
      (err: any) => {
        setCongresError(err?.message ?? String(err));
      },
    );
    return () => {
      unsubscribe();
    };
  }, [congresId]);

  return { congresData, congresError };
}

function useParticipantDetails(congresId: string, selectedRow: Row | null, isCreating: boolean) {
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [rootDoc, setRootDoc] = useState<ParticipantRootDoc | null>(null);
  const [rootSubRows, setRootSubRows] = useState<ParticipantRootSubRow[]>([]);

  useEffect(() => {
    setDetailError(null);
    if (isCreating || !selectedRow) {
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
  }, [selectedRow, congresId, isCreating]);

  return { detailLoading, detailError, rootDoc, rootSubRows };
}

function collectCategories(rows: Row[]) {
  const list = new Set<string>();
  rows.forEach((row) => {
    if (row.category) {
      list.add(String(row.category));
    }
  });
  return Array.from(list).sort((a, b) => a.localeCompare(b));
}

function filterRows(list: Row[], filters: ParticipantsFilters, debouncedQuery: string) {
  const { category, onlyAdmins, onlyScanned } = filters;
  const normalizedQuery = debouncedQuery.trim().toLowerCase();

  return list.filter((row) => {
    if (category !== 'ALL' && String(row.category) !== category) {
      return false;
    }
    if (onlyAdmins && !row.isAdmin) {
      return false;
    }
    if (onlyScanned && !row.alreadyScanned) {
      return false;
    }
    if (normalizedQuery) {
      const haystack = `${displayName(row)} ${row.email ?? ''} ${row.compagnie ?? ''} ${row.pays ?? ''} ${row.id ?? ''}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });
}

type ParticipantsToolbarProps = {
  congresId: string;
  onCongresIdChange: (value: string) => void;
  filters: ParticipantsFilters;
  updateFilter: <K extends keyof ParticipantsFilters>(key: K, value: ParticipantsFilters[K]) => void;
  categories: string[];
  loading: boolean;
  total: number;
  onStartCreate: () => void;
};

function ParticipantsToolbar({
  congresId,
  onCongresIdChange,
  filters,
  updateFilter,
  categories,
  loading,
  total,
  onStartCreate,
}: ParticipantsToolbarProps) {
  return (
    <div className="ppage-toolbar">
      <label>
        Congres ID
        <input value={congresId} onChange={(event) => onCongresIdChange(event.target.value)} />
      </label>

      <div className="sep" />

      <input
        className="search"
        placeholder="Rechercher (nom, email, compagnie, pays, id)."
        value={filters.query}
        onChange={(event) => updateFilter('query', event.target.value)}
      />

      <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>
        <option value="ALL">Toutes categories</option>
        {categories.map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>

      <label className="chk">
        <input
          type="checkbox"
          checked={filters.onlyAdmins}
          onChange={(event) => updateFilter('onlyAdmins', event.target.checked)}
        />
        Admins seulement
      </label>

      <label className="chk">
        <input
          type="checkbox"
          checked={filters.onlyScanned}
          onChange={(event) => updateFilter('onlyScanned', event.target.checked)}
        />
        Deja scannes
      </label>

      <div className="spacer" />

      <button className="btn-primary" type="button" onClick={onStartCreate}>
        Ajouter un participant
      </button>

      <div className="count">
        {loading ? 'Chargement...' : `${total} resultat${total > 1 ? 's' : ''}`}
      </div>
    </div>
  );
}

type ParticipantsTableProps = {
  rows: Row[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
};

function ParticipantsTable({ rows, loading, selectedId, onSelect }: ParticipantsTableProps) {
  return (
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

      {!loading && rows.length === 0 && (
        <div className="tempty">Aucun participant trouve.</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="tbody">
          {rows.map((row) => (
            <div
              key={row.idDoc}
              className={`tr ${selectedId === row.idDoc ? 'selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(row.idDoc)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(row.idDoc);
                }
              }}
            >
              <div className="td id mono">{row.id ?? row.idDoc}</div>
              <div className="td name">{displayName(row)}</div>
              <div className="td email">
                {row.email ? (
                  <a href={`mailto:${row.email}`} title="Envoyer un email">{row.email}</a>
                ) : <span className="muted">-</span>}
              </div>
              <div className="td comp">{row.compagnie ?? <span className="muted">-</span>}</div>
              <div className="td country">{row.pays ?? <span className="muted">-</span>}</div>
              <div className="td cat">{row.category ?? <span className="muted">-</span>}</div>
              <div className="td flag">{row.isAdmin ? 'Oui' : 'Non'}</div>
              <div className="td flag">{row.alreadyScanned ? 'Oui' : 'Non'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ParticipantsPagerProps = {
  page: number;
  pages: number;
  onChange: (value: number) => void;
};

function ParticipantsPager({ page, pages, onChange }: ParticipantsPagerProps) {
  return (
    <div className="pager">
      <button
        className="btn-ghost"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(1, page - 1))}
      >
        <span aria-hidden="true">&lt; </span>Precedent
      </button>
      <div className="page-indicator">
        Page {page} / {pages}
      </div>
      <button
        className="btn-ghost"
        disabled={page >= pages}
        onClick={() => onChange(Math.min(pages, page + 1))}
      >
        Suivant <span aria-hidden="true">&gt;</span>
      </button>
    </div>
  );
}

type ParticipantsSidebarProps = {
  congresId: string;
  congresData: (Congres & { id: string }) | null;
  congresError: string | null;
  isCreating: boolean;
  selectedRow: Row | null;
  participantKey: string;
  detailLoading: boolean;
  detailError: string | null;
  rootDoc: ParticipantRootDoc | null;
  rootSubRows: ParticipantRootSubRow[];
  formState: ParticipantFormState;
  actionState: ActionState;
  onFieldChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onCheckboxChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  onCancelCreate: () => void;
  onStartCreate: () => void;
};

function ParticipantsSidebar({
  congresId,
  congresData,
  congresError,
  isCreating,
  selectedRow,
  participantKey,
  detailLoading,
  detailError,
  rootDoc,
  rootSubRows,
  formState,
  actionState,
  onFieldChange,
  onCheckboxChange,
  onSave,
  onDelete,
  onCancelCreate,
  onStartCreate,
}: ParticipantsSidebarProps) {
  return (
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
          <div className="pdetail-header-titles">
            <h3>{isCreating ? 'Nouveau participant' : 'Participant selectionne'}</h3>
            <div className="pdetail-badges">
              {isCreating && <span className="pdetail-badge">Mode creation</span>}
              {!isCreating && selectedRow && (
                <span className="pdetail-badge">ID doc: {selectedRow.idDoc}</span>
              )}
            </div>
          </div>
          {!isCreating && (
            <button type="button" className="btn-secondary" onClick={onStartCreate}>
              Nouveau participant
            </button>
          )}
        </div>
        <form className="participant-form" onSubmit={onSave}>
          <div className="form-grid">
            {isCreating && (
              <label>
                ID document
                <input
                  name="idDoc"
                  value={formState.idDoc}
                  onChange={onFieldChange}
                  placeholder="Laisser vide pour auto"
                />
              </label>
            )}
            <label>
              Champ id
              <input
                name="id"
                value={formState.id}
                onChange={onFieldChange}
                placeholder="Identifiant visible"
              />
            </label>
            <label>
              Prenom
              <input
                name="prenom"
                value={formState.prenom}
                onChange={onFieldChange}
              />
            </label>
            <label>
              Nom
              <input
                name="nom"
                value={formState.nom}
                onChange={onFieldChange}
              />
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                value={formState.email}
                onChange={onFieldChange}
              />
            </label>
            <label>
              Compagnie
              <input
                name="compagnie"
                value={formState.compagnie}
                onChange={onFieldChange}
              />
            </label>
            <label>
              Pays
              <input
                name="pays"
                value={formState.pays}
                onChange={onFieldChange}
              />
            </label>
            <label>
              Categorie
              <input
                name="category"
                value={formState.category}
                onChange={onFieldChange}
              />
            </label>
          </div>

          <div className="form-checkboxes">
            <label>
              <input
                type="checkbox"
                name="isAdmin"
                checked={formState.isAdmin}
                onChange={onCheckboxChange}
              />
              Admin
            </label>
            <label>
              <input
                type="checkbox"
                name="alreadyScanned"
                checked={formState.alreadyScanned}
                onChange={onCheckboxChange}
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
                onClick={onDelete}
                disabled={actionState.deleting || actionState.saving}
              >
                {actionState.deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            )}
            {isCreating && (
              <button
                type="button"
                className="btn-ghost"
                onClick={onCancelCreate}
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
  );
}

export default function ParticipantsPage() {
  const [congresId, setCongresId] = useState(DEFAULT_CONGRES_ID);
  const { rows, loading } = useParticipantsData(congresId);
  const { congresData, congresError } = useCongresDocument(congresId);

  const [filters, setFilters] = useState<ParticipantsFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [formState, setFormState] = useState<ParticipantFormState>(() => makeEmptyForm());
  const [actionState, setActionState] = useState<ActionState>(initialActionState);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const debouncedQuery = useDebouncedValue(filters.query, 250);

  const categories = useMemo(() => collectCategories(rows), [rows]);
  const filteredRows = useMemo(
    () => filterRows(rows, filters, debouncedQuery),
    [rows, filters, debouncedQuery],
  );

  const isCreating = selectedId === NEW_PARTICIPANT_ID;

  useEffect(() => {
    setPage(1);
  }, [filters.category, filters.onlyAdmins, filters.onlyScanned, debouncedQuery, congresId]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [filteredRows.length, page]);

  useEffect(() => {
    if (isCreating) return;
    if (pendingId && selectedId === pendingId && !rows.some((row) => row.idDoc === pendingId)) {
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
    if (!rows.some((row) => row.idDoc === selectedId)) {
      setSelectedId(rows[0].idDoc);
    }
  }, [rows, selectedId, pendingId, isCreating]);

  useEffect(() => {
    if (pendingId && rows.some((row) => row.idDoc === pendingId)) {
      setPendingId(null);
    }
  }, [pendingId, rows]);

  useEffect(() => {
    if (isCreating) {
      setFormState(makeEmptyForm());
      setActionState(initialActionState);
      return;
    }
    const current = rows.find((row) => row.idDoc === selectedId);
    if (!current) {
      setFormState(makeEmptyForm());
      setActionState(initialActionState);
      return;
    }
    setFormState({
      id: current.id != null ? String(current.id) : '',
      idDoc: current.idDoc,
      prenom: current.prenom ? String(current.prenom) : '',
      nom: current.nom ? String(current.nom) : '',
      email: current.email ?? '',
      compagnie: current.compagnie ? String(current.compagnie) : '',
      pays: current.pays ? String(current.pays) : '',
      category: current.category ? String(current.category) : '',
      isAdmin: !!current.isAdmin,
      alreadyScanned: !!current.alreadyScanned,
    });
    setActionState(initialActionState);
  }, [isCreating, rows, selectedId]);

  const selectedRow = useMemo(() => {
    if (isCreating) return null;
    return rows.find((row) => row.idDoc === selectedId) ?? null;
  }, [rows, selectedId, isCreating]);

  const { detailLoading, detailError, rootDoc, rootSubRows } = useParticipantDetails(
    congresId,
    selectedRow,
    isCreating,
  );

  const updateFilter = useCallback(<K extends keyof ParticipantsFilters>(key: K, value: ParticipantsFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFieldChange = useCallback((event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name as keyof ParticipantFormState]: value,
    }));
  }, []);

  const handleCheckboxChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name as keyof ParticipantFormState]: checked,
    }));
  }, []);

  const handleSave = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionState({ ...initialActionState, saving: true });
    try {
      const payload = buildParticipantPayload(formState);
      if (isCreating) {
        const createdId = await createParticipant(
          congresId.trim(),
          payload,
          formState.idDoc.trim() || undefined,
        );
        setActionState({ ...initialActionState, success: 'Participant cree avec succes.' });
        setPendingId(createdId);
        setSelectedId(createdId);
      } else if (selectedRow) {
        await upsertParticipant(congresId.trim(), selectedRow.idDoc, payload);
        setPendingId(null);
        setActionState({ ...initialActionState, success: 'Participant mis a jour.' });
      }
    } catch (err: any) {
      setPendingId(null);
      setActionState({
        ...initialActionState,
        error: err?.message ?? String(err),
      });
    }
  }, [congresId, formState, isCreating, selectedRow]);

  const handleDelete = useCallback(async () => {
    if (!selectedRow) return;
    const confirmDelete = window.confirm('Supprimer ce participant ?');
    if (!confirmDelete) return;
    setActionState({ ...initialActionState, deleting: true });
    try {
      await deleteParticipant(congresId.trim(), selectedRow.idDoc);
      setActionState({ ...initialActionState, success: 'Participant supprime.' });
      setPendingId(null);
      setSelectedId('');
    } catch (err: any) {
      setActionState({
        ...initialActionState,
        error: err?.message ?? String(err),
      });
    }
  }, [congresId, selectedRow]);

  const handleCancelCreate = useCallback(() => {
    setActionState(initialActionState);
    setPendingId(null);
    if (filteredRows.length > 0) {
      setSelectedId(filteredRows[0].idDoc);
    } else if (rows.length > 0) {
      setSelectedId(rows[0].idDoc);
    } else {
      setSelectedId('');
      setFormState(makeEmptyForm());
    }
  }, [filteredRows, rows]);

  const handleStartCreate = useCallback(() => {
    setActionState(initialActionState);
    setFormState(makeEmptyForm());
    setPendingId(null);
    setSelectedId(NEW_PARTICIPANT_ID);
  }, []);

  const handleSelectRow = useCallback((id: string) => {
    setSelectedId(id);
    setPendingId(null);
    setActionState(initialActionState);
  }, []);

  const total = filteredRows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const start = (pageSafe - 1) * PAGE_SIZE;
  const currentRows = filteredRows.slice(start, start + PAGE_SIZE);
  const participantKey = isCreating
    ? 'nouveau'
    : selectedRow ? String(selectedRow.id ?? selectedRow.idDoc) : '';

  return (
    <div className="ppage">
      <div className="ppage-main">
        <ParticipantsToolbar
          congresId={congresId}
          onCongresIdChange={setCongresId}
          filters={filters}
          updateFilter={updateFilter}
          categories={categories}
          loading={loading}
          total={total}
          onStartCreate={handleStartCreate}
        />

        <ParticipantsTable
          rows={currentRows}
          loading={loading}
          selectedId={selectedId}
          onSelect={handleSelectRow}
        />

        <ParticipantsPager
          page={pageSafe}
          pages={pages}
          onChange={setPage}
        />
      </div>

      <ParticipantsSidebar
        congresId={congresId}
        congresData={congresData}
        congresError={congresError}
        isCreating={isCreating}
        selectedRow={selectedRow}
        participantKey={participantKey}
        detailLoading={detailLoading}
        detailError={detailError}
        rootDoc={rootDoc}
        rootSubRows={rootSubRows}
        formState={formState}
        actionState={actionState}
        onFieldChange={handleFieldChange}
        onCheckboxChange={handleCheckboxChange}
        onSave={handleSave}
        onDelete={handleDelete}
        onCancelCreate={handleCancelCreate}
        onStartCreate={handleStartCreate}
      />
    </div>
  );
}
