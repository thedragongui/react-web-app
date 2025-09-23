import { useEffect, useState } from 'react';
import { ref, listAll, getDownloadURL, uploadBytes, getMetadata } from 'firebase/storage';
import type { StorageReference } from 'firebase/storage';
import { storage } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import './importation-pdf.css';

type PdfItem = {
  name: string;
  path: string;
  url: string | null;
  timeCreated: string | null; // ISO
  size: number | null;
  folder: string;
};

const DEFAULT_CONGRES_ID = 'Fragilite_2025'; // adapte si besoin
const STORAGE_ROOT_FALLBACKS = [
  'abstracts',
  'badges',
  'imgIntervenants',
  'imgSponsors',
  'plan',
  'programme',
  'qrcodes',
  'qrcodesCarteDeVisite',
] as const;

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}

function formatError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: string }).message;
    return message ?? 'Erreur inconnue.';
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch (stringifyError) {
    return String(stringifyError);
  }
}

// Recursively collect every PDF stored anywhere in the bucket starting from the provided ref.
async function collectAllPdfs(baseRef: StorageReference): Promise<PdfItem[]> {
  const listing = await listAll(baseRef);
  const currentLevel = await Promise.all(
    listing.items
      .filter((itemRef) => itemRef.name.toLowerCase().endsWith('.pdf'))
      .map(async (itemRef) => {
        const [meta, url] = await Promise.allSettled([
          getMetadata(itemRef),
          getDownloadURL(itemRef),
        ]);
        const folder = itemRef.fullPath.includes('/')
          ? itemRef.fullPath.slice(0, itemRef.fullPath.lastIndexOf('/'))
          : '';
        return {
          name: itemRef.name,
          path: itemRef.fullPath,
          url: url.status === 'fulfilled' ? url.value : null,
          timeCreated: meta.status === 'fulfilled' ? meta.value.timeCreated ?? null : null,
          size: meta.status === 'fulfilled' ? meta.value.size ?? null : null,
          folder,
        } as PdfItem;
      })
  );

  if (listing.prefixes.length === 0) {
    return currentLevel;
  }

  const nestedLevels = await Promise.all(listing.prefixes.map((prefix) => collectAllPdfs(prefix)));
  return currentLevel.concat(...nestedLevels);
}

function sortPdfs(rows: PdfItem[]) {
  rows.sort((a, b) => {
    if (a.timeCreated && b.timeCreated) return b.timeCreated.localeCompare(a.timeCreated);
    return b.name.localeCompare(a.name);
  });
  return rows;
}

async function gatherPdfsFrom(refs: StorageReference[]): Promise<{ rows: PdfItem[]; errors: string[] }> {
  const map = new Map<string, PdfItem>();
  const errors: string[] = [];

  await Promise.all(
    refs.map(async (entry) => {
      try {
        const rows = await collectAllPdfs(entry);
        rows.forEach((item) => {
          map.set(item.path, item);
        });
      } catch (err) {
        errors.push(formatError(err));
      }
    })
  );

  return {
    rows: sortPdfs(Array.from(map.values())),
    errors,
  };
}

export default function ImportationPdfPage() {
  const { isAdmin } = useAuth();
  const [congresId, setCongresId] = useState(DEFAULT_CONGRES_ID);

  const [items, setItems] = useState<PdfItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshList() {
    setLoading(true);
    try {
      const rootRes = await gatherPdfsFrom([ref(storage)]);
      if (rootRes.rows.length > 0) {
        setItems(rootRes.rows);
        setError(rootRes.errors[0] ?? null);
        return;
      }

      if (STORAGE_ROOT_FALLBACKS.length > 0) {
        const fallbackRefs = STORAGE_ROOT_FALLBACKS.map((folder) => ref(storage, folder));
        const fallbackRes = await gatherPdfsFrom(fallbackRefs);
        setItems(fallbackRes.rows);
        const message = rootRes.errors[0] ?? fallbackRes.errors[0] ?? null;
        setError(message);
        return;
      }

      setItems([]);
      setError(rootRes.errors[0] ?? null);
    } catch (err) {
      console.error('Erreur lors du rafraîchissement de la liste des PDFs', err);
      setItems([]);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshList();
  }, []);

  const latest = items[0] ?? null;

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
    setUploadMsg('Téléversement en cours.');

    try {
      const ts = Date.now();
      const newName = `${ts}_${congresId}_${sanitizeFileName(file.name)}`;
      const destRef = ref(storage, `programme/${newName}`);
      await uploadBytes(destRef, file);
      setUploadMsg('Téléversement terminé ?');
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

      {error && <div className="hint">{`Attention : ${error}`}</div>}

      {loading && <div className="placeholder">Chargement des fichiers.</div>}

      {!loading && latest && (
        <div className="latest-card">
          <div>
            <div className="latest-title">Dernier PDF</div>
            <div className="latest-name">{latest.name}</div>
            <div className="latest-path">{latest.path}</div>
            <div className="latest-meta">
              {latest.timeCreated ? new Date(latest.timeCreated).toLocaleString('fr-FR') : 'Date inconnue'}
              {typeof latest.size === 'number' ? ` | ${(latest.size / 1024).toFixed(0)} Ko` : ''}
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

      {!loading && items.length === 0 && (
        <div className="empty-state">Aucun PDF trouvé.</div>
      )}

      {!loading && items.length > 0 && (
        <div className="list">
          {items.map((it) => (
            <div key={it.path} className="row">
              <div className="row-main">
                <div className="file-name">{it.name}</div>
                <div className="file-path">{it.path}</div>
                <div className="file-meta">
                  {it.timeCreated ? new Date(it.timeCreated).toLocaleString('fr-FR') : '-'}
                  {typeof it.size === 'number' ? ` | ${(it.size / 1024).toFixed(0)} Ko` : ''}
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
