import { useEffect, useMemo, useState } from 'react';
import { ref, listAll, getDownloadURL, uploadBytes, getMetadata } from 'firebase/storage';
import type { StorageReference } from 'firebase/storage';
import { storage } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_CONGRES_ID } from '../lib/congresId';
import './importation-pdf.css';

type PdfItem = {
  name: string;
  path: string;
  url: string | null;
  timeCreated: string | null;
  size: number | null;
  folder: string;
};

type SectionId = 'posters' | 'expo-plan' | 'spaces-plan' | 'infos' | 'abstracts';

type Section = {
  id: SectionId;
  label: string;
  hint: string;
  match?: (item: PdfItem) => boolean;
};

const SECTIONS: Section[] = [
  { id: 'posters', label: 'Posters', hint: 'programme/', match: (item) => item.path.toLowerCase().includes('programme/') },
  { id: 'expo-plan', label: "Plan d'exposition", hint: 'plan/', match: (item) => item.path.toLowerCase().includes('plan/') },
  { id: 'spaces-plan', label: 'Plan des espaces', hint: 'spaces', match: (item) => item.path.toLowerCase().includes('space') },
  { id: 'infos', label: 'Informations generales', hint: 'infos', match: (item) => item.path.toLowerCase().includes('info') },
  { id: 'abstracts', label: 'Livret des abstracts', hint: 'abstract', match: (item) => item.path.toLowerCase().includes('abstract') },
];

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
  } catch (error) {
    return String(error);
  }
}

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
      } catch (error) {
        errors.push(formatError(error));
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
  const [selected, setSelected] = useState<PdfItem | null>(null);
  const [section, setSection] = useState<SectionId>('posters');
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
        setLoading(false);
        return;
      }

      if (STORAGE_ROOT_FALLBACKS.length > 0) {
        const fallbackRefs = STORAGE_ROOT_FALLBACKS.map((folder) => ref(storage, folder));
        const fallbackRes = await gatherPdfsFrom(fallbackRefs);
        setItems(fallbackRes.rows);
        setError(rootRes.errors[0] ?? fallbackRes.errors[0] ?? null);
        setLoading(false);
        return;
      }

      setItems([]);
      setError(rootRes.errors[0] ?? null);
    } catch (err) {
      console.error('Erreur lors du rafraichissement des PDFs', err);
      setItems([]);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshList();
  }, []);

  const filteredItems = useMemo(() => {
    const def = SECTIONS.find((sectionDef) => sectionDef.id === section);
    if (!def?.match) return items;
    const subset = items.filter((item) => def.match?.(item));
    return subset.length > 0 ? subset : items;
  }, [items, section]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (prev && filteredItems.some((item) => item.path === prev.path)) {
        return prev;
      }
      return filteredItems[0];
    });
  }, [filteredItems]);

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isAdmin) {
      setUploadMsg('Upload reserve aux administrateurs.');
      return;
    }
    if (file.type !== 'application/pdf') {
      setUploadMsg('Veuillez selectionner un fichier PDF.');
      return;
    }
    setUploadMsg('Televersement en cours...');

    try {
      const ts = Date.now();
      const newName = `${ts}_${congresId}_${sanitizeFileName(file.name)}`;
      const dest = ref(storage, `programme/${newName}`);
      await uploadBytes(dest, file);
      setUploadMsg('Televersement termine.');
      await refreshList();
    } catch (err: any) {
      setUploadMsg(err?.message ?? String(err));
    }
  }

  return (
    <div className="content-page">
      <header className="content-header">
        <h1>Contenus application</h1>
        <nav className="content-tabs">
          {SECTIONS.map((sectionDef) => (
            <button
              key={sectionDef.id}
              type="button"
              className={`content-tab ${section === sectionDef.id ? 'active' : ''}`}
              onClick={() => setSection(sectionDef.id)}
            >
              {sectionDef.label}
            </button>
          ))}
        </nav>
        <div className="content-settings">
          <label>
            Congres ID
            <input value={congresId} onChange={(event) => setCongresId(event.target.value)} />
          </label>
        </div>
      </header>

      {error && <div className="content-alert">{`Attention : ${error}`}</div>}

      <div className="content-body">
        <section className="content-main">
          <div className="upload-card">
            <div className="upload-header">
              <h2>Importer un document</h2>
              <span className="upload-limit">PDF - 10 Mo max</span>
            </div>
            <label className="dropzone">
              <span className="drop-icon">PDF</span>
              <span className="drop-text">Importer un PDF</span>
              <input type="file" accept="application/pdf" hidden onChange={onPickFile} />
            </label>
            {uploadMsg && <span className="upload-status">{uploadMsg}</span>}

            {selected && (
              <div className="last-import">
                <div className="last-label">Derniere importation</div>
                <div className="last-name">{selected.name}</div>
                <div className="last-meta">
                  {selected.timeCreated ? new Date(selected.timeCreated).toLocaleString('fr-FR') : 'Date inconnue'}
                </div>
                <div className="last-path">{selected.path}</div>
              </div>
            )}
          </div>

          <div className="viewer-card">
            {selected?.url ? (
              <iframe title={selected.name} src={selected.url} className="pdf-viewer" />
            ) : (
              <div className="viewer-placeholder">Visualisateur de PDF</div>
            )}
          </div>
        </section>

        <aside className="content-history">
          <div className="history-header">
            <h2>Historique</h2>
            <span className="history-hint">
              {SECTIONS.find((sectionDef) => sectionDef.id === section)?.hint ?? 'programme'}
            </span>
          </div>
          {loading && <div className="history-placeholder">Chargement...</div>}
          {!loading && filteredItems.length === 0 && <div className="history-placeholder">Aucun document</div>}
          {!loading && filteredItems.length > 0 && (
            <ul className="history-list">
              {filteredItems.map((item) => (
                <li
                  key={item.path}
                  className={`history-item ${selected?.path === item.path ? 'active' : ''}`}
                  onClick={() => setSelected(item)}
                >
                  <span className="history-name">{item.name}</span>
                  <span className="history-date">
                    {item.timeCreated ? new Date(item.timeCreated).toLocaleString('fr-FR') : '-'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

