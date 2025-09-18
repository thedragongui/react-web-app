import { useEffect, useMemo, useState } from 'react';
import { ref, listAll, getMetadata, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import './badges.css';

type BadgeItem = {
  name: string;
  fullPath: string;
  url: string | null;
  contentType: string | null;
  timeCreated: string | null; // ISO
  size: number | null;
};

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}
function isImage(ct?: string | null) {
  return !!ct && ct.startsWith('image/');
}
function isPdf(ct?: string | null) {
  return ct === 'application/pdf';
}
function formatBytes(b?: number | null) {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}

export default function BadgesPage() {
  const { user, isAdmin } = useAuth();
  const [targetUid, setTargetUid] = useState<string>('');
  const effectiveUid = useMemo(() => targetUid || user?.uid || '', [targetUid, user]);

  const [items, setItems] = useState<BadgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // UI
  const [q, setQ] = useState('');
  const [type, setType] = useState<'ALL' | 'IMG' | 'PDF'>('ALL');
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // Deletion
  const [toDelete, setToDelete] = useState<BadgeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    if (!effectiveUid) return;
    setLoading(true); setErr(null);
    try {
      const folder = ref(storage, `badges/${effectiveUid}`);
      const res = await listAll(folder);
      const rows: BadgeItem[] = await Promise.all(
        res.items.map(async (it) => {
          const [meta, url] = await Promise.allSettled([getMetadata(it), getDownloadURL(it)]);
          return {
            name: it.name,
            fullPath: it.fullPath,
            url: url.status === 'fulfilled' ? url.value : null,
            contentType: meta.status === 'fulfilled' ? (meta.value.contentType ?? null) : null,
            timeCreated: meta.status === 'fulfilled' ? (meta.value.timeCreated ?? null) : null,
            size: meta.status === 'fulfilled' ? (meta.value.size ?? null) : null,
          };
        })
      );
      rows.sort((a, b) => {
        const ta = a.timeCreated ?? '';
        const tb = b.timeCreated ?? '';
        if (ta && tb) return tb.localeCompare(ta);
        return a.name.localeCompare(b.name);
      });
      setItems(rows);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    setTargetUid(''); // par défaut: “moi”
  }, [user]);

  useEffect(() => {
    if (!effectiveUid) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUid]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items.filter((it) => {
      if (type === 'IMG' && !isImage(it.contentType)) return false;
      if (type === 'PDF' && !isPdf(it.contentType)) return false;
      if (!ql) return true;
      return it.name.toLowerCase().includes(ql);
    });
  }, [items, q, type]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !effectiveUid) return;
    setUploadMsg(null);

    // Règles : owner OU admin → on laisse l’UI pour l’owner ; admin peut aussi charger pour un autre uid.
    if (!isAdmin && effectiveUid !== user?.uid) {
      setUploadMsg("Vous n'avez pas les droits pour uploader dans ce dossier.");
      return;
    }

    // Accepte images + PDF
    const ok = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!ok) {
      setUploadMsg('Type de fichier non supporté (images ou PDF uniquement).');
      return;
    }

    try {
      setUploadMsg('Téléversement en cours…');
      const ts = Date.now();
      const clean = sanitizeFileName(file.name);
      const dest = ref(storage, `badges/${effectiveUid}/${ts}_${clean}`);
      await uploadBytes(dest, file);
      setUploadMsg('Téléversement terminé ✅');
      await refresh();
    } catch (e: any) {
      setUploadMsg(e?.message ?? String(e));
    } finally {
      // reset input
      e.currentTarget.value = '';
      setTimeout(() => setUploadMsg(null), 3000);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteObject(ref(storage, toDelete.fullPath));
      setToDelete(null);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  if (!user) {
    return <div className="badges-page">Veuillez vous connecter.</div>;
  }

  return (
    <div className="badges-page">
      <div className="badges-toolbar">
        <div className="left">
          {isAdmin ? (
            <label title="Admin : parcourir un autre dossier utilisateur">
              User ID&nbsp;
              <input
                placeholder={user.uid}
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
              />
            </label>
          ) : (
            <div className="me">Dossier&nbsp;<code>badges/{user.uid}</code></div>
          )}
          <input
            className="search"
            placeholder="Rechercher par nom…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="ALL">Tous types</option>
            <option value="IMG">Images</option>
            <option value="PDF">PDF</option>
          </select>
        </div>

        <div className="right">
          <label className="btn-primary">
            + Importer
            <input type="file" accept="image/*,application/pdf" onChange={onPickFile} hidden />
          </label>
          <button className="btn-ghost" onClick={refresh} disabled={loading}>↻ Actualiser</button>
          {uploadMsg && <span className="hint">{uploadMsg}</span>}
        </div>
      </div>

      {err && <div className="error">{err}</div>}
      {loading && <div className="placeholder">Chargement…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">Aucun fichier.</div>
      )}

      <div className="badges-grid">
        {filtered.map((it) => (
          <article key={it.fullPath} className="badge-card">
            <div className="thumb">
              {isImage(it.contentType) && it.url ? (
                <img src={it.url} alt={it.name} />
              ) : isPdf(it.contentType) ? (
                <div className="pdf-thumb">PDF</div>
              ) : (
                <div className="file-thumb">Fichier</div>
              )}
            </div>
            <div className="meta">
              <div className="name" title={it.name}>{it.name}</div>
              <div className="sub">
                {it.timeCreated ? new Date(it.timeCreated).toLocaleString('fr-FR') : '—'}
                {typeof it.size === 'number' ? ` • ${formatBytes(it.size)}` : ''}
              </div>
            </div>
            <div className="actions">
              {it.url ? (
                <a className="btn-ghost sm" href={it.url} target="_blank" rel="noreferrer">Télécharger</a>
              ) : (
                <span className="hint">URL indisponible</span>
              )}
              <button
                className="btn-ghost sm danger"
                onClick={() => setToDelete(it)}
                title="Supprimer"
              >
                🗑️
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Confirm suppression */}
      {toDelete && (
        <div className="modal-backdrop" onClick={() => !deleting && setToDelete(null)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Supprimer ce fichier ?</h3>
              <button className="btn-ghost" onClick={() => !deleting && setToDelete(null)} aria-label="Fermer">×</button>
            </div>
            <div className="confirm-body">
              <div className="mono">{toDelete.fullPath}</div>
              <div>Cette action est irréversible.</div>
            </div>
            <div className="actions">
              <button className="btn-ghost" onClick={() => setToDelete(null)} disabled={deleting}>Annuler</button>
              <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
