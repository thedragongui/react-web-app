import { useEffect, useMemo, useState } from 'react';
import {
  watchSponsors, createSponsor, updateSponsor, deleteSponsor,
  type Sponsor,
} from '../firestore/firestoreApi';
import { useAuth } from '../auth/AuthContext';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import './sponsors.css';

const TIERS: Sponsor['tier'][] = ['platinum', 'gold', 'silver', 'bronze', 'partner'];

function tierLabel(t?: Sponsor['tier']) {
  switch (t) {
    case 'platinum': return 'Platinum';
    case 'gold': return 'Gold';
    case 'silver': return 'Silver';
    case 'bronze': return 'Bronze';
    case 'partner': return 'Partner';
    default: return '—';
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}
function fileExt(file: File) {
  const m = file.name.match(/\.([a-zA-Z0-9]+)$/);
  return (m ? m[1] : 'png').toLowerCase();
}

async function uploadLogoToImgSponsors(file: File, sponsorName: string) {
  const ts = Date.now();
  const path = `imgSponsors/${ts}_${sanitizeFileName(sponsorName || 'sponsor')}.${fileExt(file)}`;
  const r = ref(storage, path);
  const snap = await uploadBytes(r, file);
  const url = await getDownloadURL(snap.ref);
  return { path, url };
}

async function deleteLogoAtPath(path?: string) {
  if (!path) return;
  try { await deleteObject(ref(storage, path)); } catch { /* ignore */ }
}

/* ===== Modale créer/éditer ===== */
function SponsorModal({
  open, onClose, initial, onSaved, isAdmin
}: {
  open: boolean;
  onClose: () => void;
  initial?: Sponsor | null;
  onSaved: () => void;
  isAdmin: boolean;
}) {
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [tier, setTier] = useState<Sponsor['tier']>(initial?.tier ?? 'partner');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [email, setEmail] = useState<string>((initial as any)?.email ?? '');
  const [stand, setStand] = useState<string>((initial as any)?.stand ?? '');
  const [showBanner, setShowBanner] = useState<boolean>(Boolean((initial as any)?.showBanner));
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '');
  const [logoPath, setLogoPath] = useState(initial?.logoPath ?? '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setWebsite(initial?.website ?? '');
      setTier((initial?.tier as any) ?? 'partner');
      setDescription(initial?.description ?? '');
      setEmail((initial as any)?.email ?? '');
      setStand((initial as any)?.stand ?? '');
      setShowBanner(Boolean((initial as any)?.showBanner));
      setLogoUrl(initial?.logoUrl ?? '');
      setLogoPath(initial?.logoPath ?? '');
      setPendingFile(null);
      setSaving(false); setErr(null);
    }
  }, [open, initial]);

  const valid = useMemo(() => name.trim().length > 0, [name]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) { setErr("Action réservée aux admins."); return; }
    if (!valid) { setErr("Le nom est requis."); return; }
    setSaving(true); setErr(null);
    try {
      // Upload du logo si un fichier a été choisi
      let newLogoUrl = logoUrl;
      let newLogoPath = logoPath;
      if (pendingFile) {
        const up = await uploadLogoToImgSponsors(pendingFile, name);
        newLogoUrl = up.url;
        // Si on remplace, tente de supprimer l’ancien fichier
        if (logoPath && logoPath !== up.path) {
          await deleteLogoAtPath(logoPath);
        }
        newLogoPath = up.path;
      }

      const payload: Partial<Sponsor> & any = {
        name: name.trim(),
        website: website.trim() || undefined,
        tier,
        description: description.trim() || undefined,
        logoUrl: newLogoUrl || undefined,
        logoPath: newLogoPath || undefined,
        email: email.trim() || undefined,
        stand: stand.trim() || undefined,
        showBanner: !!showBanner,
      };

      if (isEdit && initial?.id) {
        await updateSponsor(initial.id, payload);
      } else {
        await createSponsor(payload as Required<Pick<Sponsor, 'name'>> & Partial<Sponsor>);
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
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={isEdit ? 'Éditer sponsor' : 'Ajouter un sponsor'}>
        <div className="modal-header">
          <h3>{isEdit ? 'Éditer le sponsor' : 'Ajouter un sponsor'}</h3>
          <button className="btn-ghost" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span>Nom *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du sponsor" required />
          </label>

          <div className="grid-2">
            <label className="field">
              <span>Site web</span>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
            </label>
            <label className="field">
              <span>Palier</span>
              <select value={tier} onChange={(e) => setTier(e.target.value as Sponsor['tier'])}>
                {TIERS.map(t => <option key={t} value={t}>{tierLabel(t)}</option>)}
              </select>
            </label>
          </div>

          <div className="grid-2">
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@exemple.com" />
            </label>
            <label className="field">
              <span>N° Stand</span>
              <input value={stand} onChange={(e) => setStand(e.target.value)} placeholder="ex: B07" />
            </label>
          </div>

          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Bandeau sponsor</span>
            <label className="switch">
              <input type="checkbox" checked={showBanner} onChange={e => setShowBanner(e.target.checked)} />
              <span className="slider" />
            </label>
          </div>

          <label className="field">
            <span>Description</span>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div className="field">
            <span>Logo</span>
            <div className="logo-row">
              <div className="logo-preview">
                {pendingFile ? (
                  <img src={URL.createObjectURL(pendingFile)} alt="preview" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="logo" />
                ) : (
                  <div className="logo-empty">Aucun</div>
                )}
              </div>
              <label className="btn-ghost">
                Choisir un fichier
                <input type="file" accept="image/*" hidden onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div className="hint">Le logo est stocké dans Storage : <code>imgSponsors/</code> (upload réservé aux admins).</div>
          </div>

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

/* ===== Confirm ===== */
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

/* ===== Page ===== */
export default function SponsorsPage() {
  const { isAdmin } = useAuth();

  const [rows, setRows] = useState<Sponsor[]>([]);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState<'ALL' | Sponsor['tier']>('ALL');

  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<Sponsor | null>(null);

  const [confirm, setConfirm] = useState<Sponsor | null>(null);

  useEffect(() => {
    const unsub = watchSponsors(setRows);
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((s) => {
      if (tier !== 'ALL' && s.tier !== tier) return false;
      if (!query) return true;
      const hay = `${s.name} ${s.website ?? ''} ${s.description ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [rows, q, tier]);

  return (
    <div className="spage">
      <div className="stoolbar">
        <input className="search" placeholder="Rechercher un sponsor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={tier} onChange={(e) => setTier(e.target.value as any)}>
          <option value="ALL">Tous paliers</option>
          {TIERS.map(t => <option key={t} value={t}>{tierLabel(t)}</option>)}
        </select>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn-primary" onClick={() => { setEditing(null); setOpenModal(true); }}>
            + Ajouter un sponsor
          </button>
        )}
      </div>

      <div className="sgrid">
        {filtered.map((s) => (
          <article key={s.id} className={'scard ' + (s.tier ?? '')}>
            <div className="slogo">
              {s.logoUrl ? <img src={s.logoUrl} alt={s.name} /> : <div className="logo-empty">Pas de logo</div>}
            </div>
            <div className="sbody">
              <div className="srow">
                <div className="sname">{s.name}</div>
                <div className="stier">{tierLabel(s.tier)}</div>
              </div>
              <div className="chips">
                {(s as any).stand && <span className="chip">Stand {(s as any).stand}</span>}
                {(s as any).email && <a className="chip" href={`mailto:${(s as any).email}`}>{(s as any).email}</a>}
                {s.website && <a className="chip" href={s.website} target="_blank" rel="noreferrer">Site web</a>}
              </div>
              {s.description && <div className="sdesc">{s.description}</div>}
              <div className="srow" style={{ marginTop: 8 }}>
                <div className="muted">Affichage bandeau</div>
                {isAdmin ? (
                  <label className="switch">
                    <input type="checkbox" checked={Boolean((s as any).showBanner)} onChange={() => updateSponsor(s.id!, { showBanner: !Boolean((s as any).showBanner) } as any)} />
                    <span className="slider" />
                  </label>
                ) : (
                  <span className="muted">{(s as any).showBanner ? 'Oui' : 'Non'}</span>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="sactions">
                <button className="btn-ghost sm" onClick={() => { setEditing(s); setOpenModal(true); }} aria-label="Éditer">✏️</button>
                <button className="btn-ghost sm danger" onClick={() => setConfirm(s)} aria-label="Supprimer">🗑️</button>
              </div>
            )}
          </article>
        ))}
        {filtered.length === 0 && <div className="empty-state">Aucun sponsor.</div>}
      </div>

      {/* Modale créer/éditer */}
      <SponsorModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        initial={editing ?? undefined}
        onSaved={() => {}}
        isAdmin={isAdmin}
      />

      {/* Confirm suppression */}
      <Confirm
        open={!!confirm}
        onCancel={() => setConfirm(null)}
        title="Supprimer le sponsor ?"
        message="Cette action est irréversible. Le logo stocké sera également supprimé si présent."
        onConfirm={async () => {
          if (!confirm?.id) return;
          // supprime le logo dans Storage si on a le chemin (et si l'admin est connecté → règle Storage)
          if (confirm.logoPath) { await deleteLogoAtPath(confirm.logoPath); }
          await deleteSponsor(confirm.id);
          setConfirm(null);
        }}
      />
    </div>
  );
}
