import { useEffect, useMemo, useState } from 'react';
import { watchParticipants, type Participant } from '../firestore/firestoreApi';
import './participants.css';
import { DEFAULT_CONGRES_ID } from '../lib/congresId';

type Row = Participant & { idDoc: string };

const PAGE_SIZE = 25;

//

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

  useEffect(() => {
    setLoading(true);
    const unsub = watchParticipants(congresId, (r) => {
      setRows(r.sort(compareById));
      setLoading(false);
      setPage(1); // reset page quand on change de dataset
    });
    return () => unsub();
  }, [congresId]);

  // debounce recherche
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

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
              <div key={r.idDoc} className="tr">
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
          &lt; Precedent
        </button>
        <div className="page-indicator">
          Page {pageSafe} / {pages}
        </div>
        <button
          className="btn-ghost"
          disabled={pageSafe >= pages}
          onClick={() => setPage(p => Math.min(pages, p + 1))}
        >
          Suivant &gt;
        </button>
      </div>
    </div>
  );
}

