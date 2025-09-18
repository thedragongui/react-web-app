import { useEffect, useMemo, useState } from 'react';
import { ref, listAll, getDownloadURL, uploadBytes, getMetadata } from 'firebase/storage';
import { storage } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import './importation-pdf.css';

type PdfItem = {
  name: string;
  path: string;
  url: string | null;
  timeCreated: string | null; // ISO
  size: number | null;
};

const DEFAULT_CONGRES_ID = 'Fragilite_2025'; // adapte si besoin

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}

export default function ImportationPdfPage() {
  const { isAdmin } = useAuth();
  const [congresId, setCongresId] = useState(DEFAULT_CONGRES_ID);

  const [items, setItems] = useState<PdfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [filterMine, setFilterMine] = useState(true); // filtrer par congrèsId dans le nom

  // Liste les fichiers du dossier programme/
  async function refreshList() {
    setLoading(true);
    try {
      const baseRef = ref(storage, 'programme');
      const res = await listAll(baseRef);
      const rows = await Promise.all(
        res.items.map(async (itemRef) => {
          const [meta, url] = await Promise.allSettled([getMetadata(itemRef), getDownloadURL(itemRef)]);
          return {
            name: itemRef.name,
            path: itemRef.fullPath,
            url: url.status === 'fulfilled' ? url.value : null,
            timeCreated: meta.status === 'fulfilled' ? meta.value.timeCreated ?? null : null,
            size: meta.status === 'fulfilled' ? meta.value.size ?? null : null,
          } as PdfItem;
        })
      );

      // Trie par date de création (desc) ; fallback au tri alphabétique si pas de timeCreated
      rows.sort((a, b) => {
        if (a.timeCreated && b.timeCreated) return b.timeCreated.localeCompare(a.timeCreated);
        return b.name.localeCompare(a.name);
      });

      setItems(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshList();
  }, []);

  // Filtrer par congrès si le nom contient _{congresId}_
  const filtered = useMemo(() => {
    if (!filterMine) return items;
    const key = `_${congresId}_`;
    const altKey = `${congresId}_`; // tolérance si pas d’underscore initial
    return items.filter(i => i.name.includes(key) || i.name.includes(altKey));
  }, [items, filterMine, congresId]);

  const latest = filtered[0] ?? null;

  // Upload (admin only)
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAdmin) {
      setUploadMsg("Droits insuffisants : seul un administrateur peut téléverser le programme.");
      return;
    }
    if (file.type !== 'application/pdf') {
      setUploadMsg('Veuillez sélectionner un fichier PDF.');
      return;
    }
    setUploadMsg('Téléversement en cours…');

    try {
      // Convention de nommage : {timestamp}_{congresId}_{nomSanitise}.pdf
      const ts = Date.now();
      const newName = `${ts}_${congresId}_${sanitizeFileName(file.name)}`;
      const destRef = ref(storage, `programme/${newName}`);
      await uploadBytes(destRef, file);
      setUploadMsg('Téléversement terminé ✅');
      await refreshList();
    } catch (err: any) {
      setUploadMsg(err?.message ?? String(err));
    }
  }

  return (
    <div className="pdf-page">
      <div className="pdf-toolbar">
        <div className="left">
          <label>
            Congrès ID&nbsp;
            <input value={congresId} onChange={e => setCongresId(e.target.value)} />
          </label>
          <label className="chk">
            <input type="checkbox" checked={filterMine} onChange={e => setFilterMine(e.target.checked)} />
            Afficher seulement les PDFs contenant l’ID du congrès
          </label>
        </div>
        <div className="right">
          {isAdmin ? (
            <>
              <label className="btn-primary">
                + Importer un PDF
                <input type="file" accept="application/pdf" onChange={onPickFile} hidden />
              </label>
              {uploadMsg && <span className="hint">{uploadMsg}</span>}
            </>
          ) : (
            <span className="hint">Upload réservé aux admins</span>
          )}
        </div>
      </div>

      {loading && <div className="placeholder">Chargement des fichiers…</div>}

      {!loading && latest && (
        <div className="latest-card">
          <div>
            <div className="latest-title">Dernier PDF</div>
            <div className="latest-name">{latest.name}</div>
            <div className="latest-meta">
              {latest.timeCreated ? new Date(latest.timeCreated).toLocaleString('fr-FR') : 'Date inconnue'}
              {typeof latest.size === 'number' ? ` • ${(latest.size / 1024).toFixed(0)} Ko` : ''}
            </div>
          </div>
          <div>
            {latest.url ? (
              <a className="btn-primary" href={latest.url} target="_blank" rel="noreferrer">Télécharger</a>
            ) : (
              <span className="hint">URL indisponible</span>
            )}
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">Aucun PDF trouvé {filterMine ? `pour “${congresId}”` : ''}.</div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="list">
          {filtered.map((it) => (
            <div key={it.path} className="row">
              <div className="row-main">
                <div className="file-name">{it.name}</div>
                <div className="file-meta">
                  {it.timeCreated ? new Date(it.timeCreated).toLocaleString('fr-FR') : '—'}
                  {typeof it.size === 'number' ? ` • ${(it.size / 1024).toFixed(0)} Ko` : ''}
                </div>
              </div>
              <div className="row-actions">
                {it.url ? <a className="btn-ghost" href={it.url} target="_blank" rel="noreferrer">Télécharger</a> : <span className="hint">URL indisponible</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
