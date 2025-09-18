import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { uploadToArea, listArea, type StorageArea } from '../storage/storageApi';

function Uploader({ area }: { area: StorageArea }) {
  const { user, isAdmin } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('Envoi…');
    try {
      const downloadUrl = await uploadToArea(area, file, user, isAdmin);
      setUrl(downloadUrl);
      setMsg('Terminé ✅');
    } catch (err: any) {
      setMsg(err?.message ?? String(err));
    }
  }

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <strong>Uploader — {area}</strong><br />
      <input type="file" onChange={onChange} />
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      {url && <div>URL: <a href={url} target="_blank">ouvrir</a></div>}
    </div>
  );
}

function Lister({ area, personal = false }: { area: StorageArea; personal?: boolean }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<{name:string; path:string; url:string|null}[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setMsg('Chargement…');
        const res = await listArea(area, personal ? user : null);
        setRows(res.items);
        setMsg(null);
      } catch (e: any) {
        setMsg(e?.message ?? String(e));
      }
    })();
  }, [area, user, personal]);

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <strong>Liste — {area}{personal ? ' (perso)' : ''}</strong>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      <ul>
        {rows.map(r => (
          <li key={r.path}>
            {r.name} — {r.url ? <a href={r.url} target="_blank">ouvrir</a> : 'URL indisponible'}
          </li>
        ))}
        {rows.length === 0 && !msg && <li>Aucun fichier</li>}
      </ul>
    </div>
  );
}

export default function StorageDemo() {
  const { user, isAdmin } = useAuth();

  return (
    <div style={{ padding: 24 }}>
      <h2>Storage — Démo d’interactions</h2>
      <p>Connecté: <strong>{user?.email}</strong> {isAdmin ? '(admin)' : ''}</p>

      <h3>Mes dossiers (écriture autorisée à l’utilisateur)</h3>
      <Uploader area="photos" />
      <Uploader area="qrcodes" />
      <Uploader area="qrcodesCarteDeVisite" />
      <Uploader area="badges" />
      <Uploader area="intervenants" />

      <Lister area="photos" personal />
      <Lister area="qrcodes" personal />
      <Lister area="badges" personal />
      <Lister area="intervenants" personal />

      <h3>Ressources partagées (lecture pour tout utilisateur connecté)</h3>
      <Lister area="programme" />
      <Lister area="abstracts" />
      <Lister area="plan" />
      <Lister area="imgIntervenants" />
      <Lister area="imgSponsors" />

      {isAdmin && (
        <>
          <h3>Zone Admin (écriture réservée)</h3>
          <Uploader area="programme" />
          <Uploader area="abstracts" />
          <Uploader area="plan" />
          <Uploader area="imgIntervenants" />
          <Uploader area="imgSponsors" />
        </>
      )}
    </div>
  );
}
