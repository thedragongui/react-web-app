import { useEffect, useMemo, useState } from 'react';
import {
  watchParticipants,
  watchCongres,
  getParticipantRootDoc,
  listParticipantRootSubcollection,
  type Participant,
  type Congres,
  type ParticipantRootDoc,
  type ParticipantRootSubRow,
} from '../firestore/firestoreApi';
import './participants.css';
import { DEFAULT_CONGRES_ID } from '../lib/congresId';

type Row = Participant & { idDoc: string };

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
    if (rows.length === 0) {
      if (selectedId !== '') setSelectedId('');
      return;
    }
    if (!rows.some(r => r.idDoc === selectedId)) {
      setSelectedId(rows[0].idDoc);
    }
  }, [rows, selectedId]);

  const selectedRow = useMemo(() => rows.find(r => r.idDoc === selectedId) ?? null, [rows, selectedId]);

  useEffect(() => {
    setDetailError(null);
    if (!selectedRow) {
      setDetailLoading(false);
      setRootDoc(null);
      setRootSubRows([]);
      return;
    }
    let cancelled = false;
    async function loadDetails() {
      setDetailLoading(true);
      const participantKey = String(selectedRow.id ?? selectedRow.idDoc);
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

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const start = (pageSafe - 1) * PAGE_SIZE;
  const current = filtered.slice(start, start + PAGE_SIZE);
  const participantKey = selectedRow ? String(selectedRow.id ?? selectedRow.idDoc) : '';

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
            <h3>Participant selectionne</h3>
            {selectedRow && <span className="pdetail-badge">ID: {selectedRow.id ?? selectedRow.idDoc}</span>}
          </div>
          {selectedRow ? (
            <pre className="json-viewer">{JSON.stringify(selectedRow, null, 2)}</pre>
          ) : (
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
          ) : (
            <div className="pdetail-empty">Selectionnez un participant dans la liste.</div>
          )}
        </section>
      </div>
    </div>
  );
}
