import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  watchLinks, createLink, updateLink, deleteLink, swapLinkOrder, type LinkItem
} from '../firestore/firestoreApi';
import './links.css';

function isValidUrl(u: string) {
  try { new URL(u); return true; } catch { return false; }
}

function LinkModal({
  open, onClose, initial, isAdmin, onSaved
}: {
  open: boolean; onClose: () => void; initial?: LinkItem | null;
  isAdmin: boolean; onSaved: () => void;
}) {
  const isEdit = !!initial?.id;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [isExternal, setIsExternal] = useState<boolean>(initial?.isExternal ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? '');
      setUrl(initial?.url ?? '');
      setCategory(initial?.category ?? '');
      setIsExternal(initial?.isExternal ?? true);
      setSaving(false); setErr(null);
    }
  }, [open, initial]);

  const valid = title.trim().length > 0 && isValidUrl(url);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) { setErr("Action réservée aux admins."); return; }
    if (!valid) { setErr("Titre requis et URL valide (https://…)."); return; }
    setSaving(true); setErr(null);
    try {
      if (isEdit && initial?.id) {
        await updateLink(initial.id, {
          title: title.trim(),
          url: url.trim(),
          category: category.trim() || undefined,
          isExternal,
        });
      } else {
        await createLink({
          title: title.trim(),
          url: url.trim(),
          category: category.trim() || undefined,
          isExternal,
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Éditer le lien' : 'Ajouter un lien'}>
        <div className="modal-header">
          <h3>{isEdit ? 'Éditer le lien' : 'Ajouter un lien'}</h3>
          <button className="btn-ghost" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span>Titre *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Programme détaillé" />
          </label>
          <label className="field">
            <span>URL *</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Catégorie</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex. Programme / Infos / Divers" />
            </label>
            <label className="field chk">
              <input type="checkbox" checked={isExternal} onChange={(e) => setIsExternal(e.target.checked)} />
              Ouvrir dans un nouvel onglet
            </label>
          </div>

          {!isValidUrl(url) && url && <div className="error">URL invalide (astuce : commence par https://).</div>}
          {err && <div className="error">{err}</div>}

          <div className="actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={!valid || saving || !isAdmin}>
              {saving ? 'Enregistrement…' : (isEdit ? 'Mettre à jour' : 'Enregistrer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Confirm({
  open, onCancel, onConfirm, title, message
}: {
  open: boolean; onCancel: () => void; onConfirm: () => void; title: string; message: string;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-ghost" onClick={onCancel} aria-label="Fermer">×</button>
        </div>
        <div className="confirm-body">{message}</div>
        <div className="actions">
          <button className="btn-ghost" onClick={onCancel}>Annuler</button>
          <button className="btn-danger" onClick={onConfirm}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}

export default function LinksPage() {
  const { isAdmin } = useAuth();

  const [rows, setRows] = useState<LinkItem[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('ALL');

  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<LinkItem | null>(null);
  const [confirm, setConfirm] = useState<LinkItem | null>(null);

  useEffect(() => {
    const unsub = watchLinks(setRows);
    return () => unsub();
  }, []);

  const categories = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.category) s.add(String(r.category)); });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== 'ALL' && r.category !== category) return false;
      if (!query) return true;
      const hay = `${r.title} ${r.url} ${r.category ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [rows, q, category]);

  function move(up: boolean, idx: number) {
    const a = filtered[idx];
    const b = filtered[up ? idx - 1 : idx + 1];
    if (!a || !b || !a.id || !b.id) return;
    swapLinkOrder({ id: a.id, order: a.order }, { id: b.id, order: b.order });
  }

  return (
    <div className="lpage">
      <div className="ltoolbar">
        <input className="search" placeholder="Rechercher un lien…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="ALL">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn-primary" onClick={() => { setEditing(null); setOpenModal(true); }}>
            + Ajouter un lien
          </button>
        )}
      </div>

      <div className="llist">
        {filtered.map((r, i) => (
          <article key={r.id} className="litem">
            <div className="lmain">
              <div className="ltitle">{r.title}</div>
              <a className="lurl" href={r.url} target={r.isExternal !== false ? '_blank' : '_self'} rel="noreferrer">
                {r.url}
              </a>
              <div className="lmeta">
                <span className="lcat">{r.category ?? '—'}</span>
                {r.isExternal !== false ? <span className="lbubble">nouvel onglet</span> : <span className="lbubble">même onglet</span>}
              </div>
            </div>

            <div className="lactions">
              {isAdmin && (
                <>
                  <button className="btn-ghost sm" onClick={() => i > 0 && move(true, i)} title="Monter" disabled={i === 0}>▲</button>
                  <button className="btn-ghost sm" onClick={() => i < filtered.length - 1 && move(false, i)} title="Descendre" disabled={i === filtered.length - 1}>▼</button>
                  <button className="btn-ghost sm" onClick={() => { setEditing(r); setOpenModal(true); }} aria-label="Éditer">✏️</button>
                  <button className="btn-ghost sm danger" onClick={() => setConfirm(r)} aria-label="Supprimer">🗑️</button>
                </>
              )}
            </div>
          </article>
        ))}
        {filtered.length === 0 && <div className="empty-state">Aucun lien.</div>}
      </div>

      {/* Modale */}
      <LinkModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        initial={editing ?? undefined}
        isAdmin={isAdmin}
        onSaved={() => {}}
      />

      {/* Confirm suppression */}
      <Confirm
        open={!!confirm}
        onCancel={() => setConfirm(null)}
        title="Supprimer le lien ?"
        message="Cette action est irréversible."
        onConfirm={async () => {
          if (!confirm?.id) return;
          await deleteLink(confirm.id);
          setConfirm(null);
        }}
      />
    </div>
  );
}
