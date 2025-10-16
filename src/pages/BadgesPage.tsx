import { useCallback, useEffect, useMemo, useState } from 'react';
import { ref, listAll, getMetadata, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import './badges.css';

type BadgeItem = {
  name: string;
  fullPath: string;
  url: string | null;
  contentType: string | null;
  timeCreated: string | null;
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
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const effectiveUid = useMemo(() => {
    const trimmed = targetUid.trim();
    if (trimmed) return trimmed;
    return user?.uid ?? '';
  }, [targetUid, user]);

  const [folders, setFolders] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [folderQuery, setFolderQuery] = useState('');

  const [items, setItems] = useState<BadgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [type, setType] = useState<'ALL' | 'IMG' | 'PDF'>('ALL');
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const [toDelete, setToDelete] = useState<BadgeItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setTargetUid('');
    setHasAutoSelected(false);
  }, [user]);

  const refresh = useCallback(async () => {
    if (!effectiveUid) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
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
  }, [effectiveUid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadFolders = useCallback(async () => {
    if (!isAdmin) return;
    setFoldersLoading(true);
    setFoldersError(null);
    try {
      const root = ref(storage, 'badges');
      const res = await listAll(root);
      const names = res.prefixes.map((p) => p.name).sort((a, b) => a.localeCompare(b));
      setFolders(names);
      if (!hasAutoSelected && names.length > 0) {
        const currentUserId = user?.uid ?? '';
        setTargetUid((prev) => {
          const trimmed = prev.trim();
          if (trimmed) {
            setHasAutoSelected(true);
            return trimmed;
          }
          const fallback = (currentUserId && names.includes(currentUserId)) ? currentUserId : names[0];
          if (fallback) {
            setHasAutoSelected(true);
            return fallback;
          }
          return prev;
        });
      }
    } catch (e: any) {
      setFoldersError(e?.message ?? String(e));
    } finally {
      setFoldersLoading(false);
    }
  }, [hasAutoSelected, isAdmin, user]);

  useEffect(() => {
    if (!isAdmin) return;
    loadFolders();
  }, [isAdmin, loadFolders]);

  const filteredFolders = useMemo(() => {
    const search = folderQuery.trim().toLowerCase();
    if (!search) return folders;
    return folders.filter((name) => name.toLowerCase().includes(search));
  }, [folderQuery, folders]);

  const filteredItems = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items.filter((it) => {
      if (type === 'IMG' && !isImage(it.contentType)) return false;
      if (type === 'PDF' && !isPdf(it.contentType)) return false;
      if (!ql) return true;
      return it.name.toLowerCase().includes(ql);
    });
  }, [items, q, type]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const clearInput = () => {
      event.target.value = '';
      setTimeout(() => setUploadMsg(null), 3000);
    };
    if (!effectiveUid) {
      setUploadMsg("Selectionnez un participant avant d'importer.");
      clearInput();
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      clearInput();
      return;
    }
    setUploadMsg(null);

    if (!isAdmin && effectiveUid !== user?.uid) {
      setUploadMsg("Vous n'avez pas les droits pour ajouter un fichier dans ce dossier.");
      clearInput();
      return;
    }

    const ok = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!ok) {
      setUploadMsg('Type de fichier non supporte (image ou PDF uniquement).');
      clearInput();
      return;
    }

    try {
      setUploadMsg('Televersement en cours...');
      const ts = Date.now();
      const clean = sanitizeFileName(file.name);
      const dest = ref(storage, `badges/${effectiveUid}/${ts}_${clean}`);
      await uploadBytes(dest, file);
      setUploadMsg('Televersement termine.');
      await refresh();
    } catch (e: any) {
      setUploadMsg(e?.message ?? 'Erreur lors du televersement.');
    } finally {
      clearInput();
    }
  }, [effectiveUid, isAdmin, refresh, user]);

  const confirmDelete = useCallback(async () => {
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
  }, [refresh, toDelete]);

  if (!user) {
    return <div className="badges-page">Veuillez vous connecter.</div>;
  }

  return (
    <div className={`badges-page${isAdmin ? ' admin' : ''}`}>
      {isAdmin && (
        <aside className="badges-sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title">
              Participants
              {folders.length > 0 && <span className="sidebar-count">{folders.length}</span>}
            </div>
            <button
              type="button"
              className="btn-ghost sm"
              onClick={loadFolders}
              disabled={foldersLoading}
            >
              {foldersLoading ? 'Chargement...' : 'Rafraichir'}
            </button>
          </div>
          <input
            className="sidebar-search"
            placeholder="Rechercher un ID..."
            value={folderQuery}
            onChange={(e) => setFolderQuery(e.target.value)}
          />
          {foldersError && <div className="error">{foldersError}</div>}
          <div className="folder-list">
            {filteredFolders.length === 0 ? (
              <div className="empty-state">Aucun dossier trouve.</div>
            ) : (
              filteredFolders.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`folder-item${name === effectiveUid ? ' active' : ''}`}
                  onClick={() => {
                    setHasAutoSelected(true);
                    setTargetUid(name);
                  }}
                >
                  <span className="folder-name">{name}</span>
                  {name === user.uid && <span className="badge-self">vous</span>}
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      <div className="badges-content">
        <div className="badges-toolbar">
          <div className="left">
            <div className="me">
              Dossier&nbsp;
              <code>badges/{effectiveUid || '...'}</code>
            </div>
            {isAdmin && (
              <label className="manual-id">
                ID utilisateur
                <input
                  placeholder={user.uid}
                  value={targetUid}
                  onChange={(e) => {
                    setHasAutoSelected(true);
                    setTargetUid(e.target.value);
                  }}
                />
              </label>
            )}
            <input
              className="badges-search"
              placeholder="Rechercher par nom..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="ALL">Tous types</option>
              <option value="IMG">Images</option>
              <option value="PDF">PDF</option>
            </select>
          </div>

          <div className="right">
            <label className="btn-primary">
              + Importer
              <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} hidden />
            </label>
            <button
              type="button"
              className="btn-ghost"
              onClick={refresh}
              disabled={loading || !effectiveUid}
            >
              Actualiser
            </button>
            {uploadMsg && <span className="hint">{uploadMsg}</span>}
          </div>
        </div>

        {err && <div className="error">{err}</div>}
        {loading && <div className="placeholder">Chargement...</div>}

        {!loading && !effectiveUid && (
          <div className="empty-state">Selectionnez un participant.</div>
        )}

        {!loading && effectiveUid && filteredItems.length === 0 && (
          <div className="empty-state">Aucun fichier.</div>
        )}

        {effectiveUid && (
          <div className="badges-grid">
            {filteredItems.map((it) => (
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
                    {it.timeCreated ? new Date(it.timeCreated).toLocaleString('fr-FR') : '--'}
                    {typeof it.size === 'number' ? ` - ${formatBytes(it.size)}` : ''}
                  </div>
                </div>
                <div className="actions">
                  {it.url ? (
                    <a className="btn-ghost sm" href={it.url} target="_blank" rel="noreferrer">
                      Telecharger
                    </a>
                  ) : (
                    <span className="hint">URL indisponible</span>
                  )}
                  <button
                    type="button"
                    className="btn-ghost sm danger"
                    onClick={() => setToDelete(it)}
                    title="Supprimer"
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {toDelete && (
          <div className="modal-backdrop" onClick={() => !deleting && setToDelete(null)}>
            <div className="modal small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Supprimer ce fichier ?</h3>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => !deleting && setToDelete(null)}
                  aria-label="Fermer"
                >
                  Fermer
                </button>
              </div>
              <div className="confirm-body">
                <div className="mono">{toDelete.fullPath}</div>
                <div>Cette action est irreversible.</div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setToDelete(null)}
                  disabled={deleting}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
