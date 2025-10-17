import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCongresId } from '../lib/congresId';
import { watchCongres, updateCongres, type Congres } from '../firestore/firestoreApi';
import type { SponsorItem } from '../firestore/schema';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { stripUndefined } from '../lib/stripUndefined';
import './sponsors.css';

type SponsorFormValues = {
  id?: string;
  title: string;
  description?: string;
  website?: string;
  email?: string;
  numeroStand?: string;
  adresse?: string;
  bandeauURL?: string;
  affichageBandeau?: boolean;
  logoUrl?: string;
  logoPath?: string;
  imageUrlLogo?: string;
};

type SponsorUiItem = SponsorFormValues & { _index: number };

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}

function fileExt(file: File) {
  const match = file.name.match(/\.([a-zA-Z0-9]+)$/);
  return (match ? match[1] : 'png').toLowerCase();
}

async function uploadLogoToSponsorIcons(file: File, sponsorName: string) {
  const ts = Date.now();
  const path = `sponsors/icones/${ts}_${sanitizeFileName(sponsorName || 'sponsor')}.${fileExt(file)}`;
  const handle = ref(storage, path);
  const snap = await uploadBytes(handle, file);
  const url = await getDownloadURL(snap.ref);
  return { path, url };
}

async function deleteLogoAtPath(path?: string) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // ignore storage deletion failures
  }
}

function SponsorModal({
  open,
  onClose,
  initial,
  onSubmit,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  initial?: SponsorFormValues | null;
  onSubmit: (data: SponsorFormValues) => Promise<void>;
  isAdmin: boolean;
}) {
  const isEdit = Boolean(initial?.id);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [stand, setStand] = useState(initial?.numeroStand ?? '');
  const [adresse, setAdresse] = useState(initial?.adresse ?? '');
  const [bandeauUrl, setBandeauUrl] = useState(initial?.bandeauURL ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [showBanner, setShowBanner] = useState(Boolean(initial?.affichageBandeau));
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? initial?.imageUrlLogo ?? '');
  const [logoPath, setLogoPath] = useState(initial?.logoPath ?? '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(initial?.title ?? '');
    setWebsite(initial?.website ?? '');
    setEmail(initial?.email ?? '');
    setStand(initial?.numeroStand ?? '');
    setAdresse(initial?.adresse ?? '');
    setBandeauUrl(initial?.bandeauURL ?? '');
    setDescription(initial?.description ?? '');
    setShowBanner(Boolean(initial?.affichageBandeau));
    setLogoUrl(initial?.logoUrl ?? initial?.imageUrlLogo ?? '');
    setLogoPath(initial?.logoPath ?? '');
    setPendingFile(null);
    setSaving(false);
    setErr(null);
  }, [open, initial]);

  const previewUrl = useMemo(() => (pendingFile ? URL.createObjectURL(pendingFile) : null), [pendingFile]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const valid = useMemo(() => title.trim().length > 0, [title]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPendingFile(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) {
      setErr('Action reservee aux admins.');
      return;
    }
    if (!valid) {
      setErr('Le titre est requis.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let nextLogoUrl = logoUrl;
      let nextLogoPath = logoPath;
      if (pendingFile) {
        const uploaded = await uploadLogoToSponsorIcons(pendingFile, title);
        nextLogoUrl = uploaded.url;
        if (logoPath && logoPath !== uploaded.path) {
          await deleteLogoAtPath(logoPath);
        }
        nextLogoPath = uploaded.path;
      }

      const payload: SponsorFormValues = {
        id: initial?.id,
        title: title.trim(),
        website: website.trim() || undefined,
        email: email.trim() || undefined,
        numeroStand: stand.trim() || undefined,
        adresse: adresse.trim() || undefined,
        bandeauURL: bandeauUrl.trim() || undefined,
        description: description.trim() || undefined,
        affichageBandeau: !!showBanner,
        logoUrl: nextLogoUrl || undefined,
        logoPath: nextLogoPath || undefined,
        imageUrlLogo: nextLogoUrl || undefined,
      };

      await onSubmit(payload);
      onClose();
    } catch (error: any) {
      setErr(error?.message ?? String(error));
    } finally {
      setSaving(false);
      setPendingFile(null);
    }
  };

  if (!open) return null;

  return (
    <div className='modal-backdrop' onClick={onClose}>
      <div className='modal' onClick={(event) => event.stopPropagation()} role='dialog' aria-modal='true'>
        <div className='modal-header'>
          <h3>{isEdit ? 'Modifier le sponsor' : 'Ajouter un sponsor'}</h3>
          <button className='btn-ghost' onClick={onClose} aria-label='Fermer'>x</button>
        </div>
        <form className='form' onSubmit={handleSubmit}>
          <label className='field'>
            <span>Titre *</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder='Nom du sponsor' required />
          </label>

          <div className='grid-2'>
            <label className='field'>
              <span>Site web</span>
              <input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder='https://...' />
            </label>
            <label className='field'>
              <span>Email</span>
              <input type='email' value={email} onChange={(event) => setEmail(event.target.value)} placeholder='contact@example.com' />
            </label>
          </div>

          <div className='grid-2'>
            <label className='field'>
              <span>Numero de stand</span>
              <input value={stand} onChange={(event) => setStand(event.target.value)} placeholder='ex: B07' />
            </label>
            <label className='field'>
              <span>Bandeau URL</span>
              <input value={bandeauUrl} onChange={(event) => setBandeauUrl(event.target.value)} placeholder='https://...' />
            </label>
          </div>

          <label className='field'>
            <span>Adresse</span>
            <input value={adresse} onChange={(event) => setAdresse(event.target.value)} placeholder='Adresse postale' />
          </label>

          <label className='field'>
            <span>Description</span>
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>

          <div className='field' style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Afficher dans le bandeau</span>
            <label className='switch'>
              <input type='checkbox' checked={showBanner} onChange={(event) => setShowBanner(event.target.checked)} />
              <span className='slider' />
            </label>
          </div>

          <div className='field'>
            <span>Logo</span>
            <div className='logo-row'>
              <div className='logo-preview'>
                {previewUrl ? (
                  <img src={previewUrl} alt='logo preview' />
                ) : logoUrl ? (
                  <img src={logoUrl} alt='logo' />
                ) : (
                  <div className='logo-empty'>Aucun</div>
                )}
              </div>
              <label className='btn-ghost'>
                Choisir un fichier
                <input type='file' accept='image/*' hidden onChange={handleFileChange} />
              </label>
            </div>
            <div className='hint'>Les fichiers sont stockes dans Storage sous sponsors/icones/.</div>
          </div>

          {err && <div className='error'>{err}</div>}

          <div className='actions'>
            <button type='button' className='btn-ghost' onClick={onClose}>Annuler</button>
            <button type='submit' className='btn-primary' disabled={!valid || saving || !isAdmin}>
              {saving ? 'Enregistrement...' : isEdit ? 'Mettre a jour' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Confirm({
  open,
  onCancel,
  title,
  message,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
}) {
  if (!open) return null;
  return (
    <div className='modal-backdrop' onClick={onCancel}>
      <div className='modal small' onClick={(event) => event.stopPropagation()} role='dialog' aria-modal='true'>
        <div className='modal-header'>
          <h3>{title}</h3>
          <button className='btn-ghost' onClick={onCancel} aria-label='Fermer'>x</button>
        </div>
        <div className='confirm-body'>{message}</div>
        <div className='actions'>
          <button className='btn-ghost' onClick={onCancel}>Annuler</button>
          <button className='btn-danger' onClick={onConfirm}>Supprimer</button>
        </div>
      </div>
    </div>
  );
}

export default function SponsorsPage() {
  const { isAdmin } = useAuth();
  const [congresId] = useCongresId();
  const [congres, setCongres] = useState<(Congres & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushStatus = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current) {
      clearTimeout(statusTimer.current);
    }
    statusTimer.current = setTimeout(() => {
      setStatus(null);
      statusTimer.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    setError(null);
    setLoading(true);
    const unsubscribe = watchCongres(
      congresId,
      (data) => {
        setCongres(data);
        setLoading(false);
      },
      (err) => {
        setError(err?.message ?? 'Impossible de charger les sponsors.');
        setLoading(false);
      }
    );
    return () => {
      unsubscribe();
    };
  }, [congresId]);

  const sponsors = useMemo<SponsorUiItem[]>(() => {
    const list = congres?.listSponsors ?? [];
    return list.map((item, index) => {
      const typed = item as SponsorItem & { [key: string]: unknown };
      const legacyName = typeof (typed as any).name === 'string' ? ((typed as any).name as string) : '';
      const rawTitle = typeof typed.title === 'string' ? typed.title : '';
      const title = (rawTitle || legacyName || `Sponsor ${index + 1}`).trim();
      const rawWebsite = (typed as any).website ?? (typed as any).siteWeb ?? typed.website;
      const website = typeof rawWebsite === 'string' && rawWebsite.trim().length > 0 ? rawWebsite.trim() : undefined;
      const rawEmail = (typed as any).email ?? typed.email;
      const email = typeof rawEmail === 'string' && rawEmail.trim().length > 0 ? rawEmail.trim() : undefined;
      const rawStand = typed.numeroStand ?? (typed as any).stand;
      const numeroStand = rawStand != null && String(rawStand).trim().length > 0 ? String(rawStand).trim() : undefined;
      const rawAdresse = (typed as any).adresse;
      const adresse = typeof rawAdresse === 'string' && rawAdresse.trim().length > 0 ? rawAdresse.trim() : undefined;
      const rawBandeau = (typed as any).bandeauURL ?? typed.bandeauURL;
      const bandeauURL = typeof rawBandeau === 'string' && rawBandeau.trim().length > 0 ? rawBandeau.trim() : undefined;
      const rawDescription = (typed as any).description ?? typed.description;
      const description = typeof rawDescription === 'string' ? rawDescription : undefined;
      const rawLogo = (typed as any).logoUrl ?? typed.imageUrlLogo ?? typed.logoUrl;
      const logoUrl = typeof rawLogo === 'string' && rawLogo.length > 0 ? rawLogo : undefined;
      const logoPath = typeof (typed as any).logoPath === 'string' ? ((typed as any).logoPath as string) : undefined;
      const affiche = (typed as any).affichageBandeau ?? (typed as any).showBanner ?? typed.affichageBandeau;
      return {
        id: typeof typed.id === 'string' && typed.id ? typed.id : (typeof (typed as any).id === 'string' ? ((typed as any).id as string) : undefined),
        title,
        description,
        website,
        email,
        numeroStand,
        adresse,
        bandeauURL,
        affichageBandeau: Boolean(affiche),
        logoUrl,
        logoPath,
        imageUrlLogo: typeof typed.imageUrlLogo === 'string' && typed.imageUrlLogo.length > 0 ? typed.imageUrlLogo : logoUrl,
        _index: index,
      };
    });
  }, [congres?.listSponsors]);

  const [q, setQ] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<SponsorUiItem | null>(null);
  const [confirm, setConfirm] = useState<SponsorUiItem | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const sorted = [...sponsors].sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
    if (!query) {
      return sorted;
    }
    return sorted.filter((item) => {
      const haystack = [
        item.title,
        item.description ?? '',
        item.email ?? '',
        item.website ?? '',
        item.bandeauURL ?? '',
        item.adresse ?? '',
        item.numeroStand ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [sponsors, q]);

  const handleSaveSponsor = useCallback(async (payload: SponsorFormValues, index: number | null) => {
    if (!isAdmin) {
      throw new Error('Action reservee aux admins.');
    }
    if (!congresId) {
      throw new Error('Aucun congres selectionne.');
    }
    const current = [...(congres?.listSponsors ?? [])];
    const existing = index != null && index >= 0 && index < current.length ? current[index] : undefined;
    const baseId = payload.id ?? (existing as any)?.id ?? `sponsor_${Date.now()}`;
    const standValue = payload.numeroStand?.trim();
    const nextItem: SponsorItem = {
      ...(existing as SponsorItem | undefined),
      ...payload,
      id: baseId,
      title: payload.title,
      numeroStand: standValue || undefined,
      bandeauURL: payload.bandeauURL,
      affichageBandeau: payload.affichageBandeau ?? Boolean((existing as any)?.affichageBandeau ?? (existing as any)?.showBanner),
      imageUrlLogo: payload.imageUrlLogo ?? payload.logoUrl ?? (existing as any)?.imageUrlLogo,
      logoUrl: payload.logoUrl ?? payload.imageUrlLogo ?? (existing as any)?.logoUrl,
      logoPath: payload.logoPath ?? (existing as any)?.logoPath,
      website: payload.website,
      email: payload.email,
      adresse: payload.adresse,
      description: payload.description,
    };
    (nextItem as any).showBanner = nextItem.affichageBandeau;
    (nextItem as any).stand = nextItem.numeroStand ?? (existing as any)?.stand;

    if (index != null && index >= 0 && index < current.length) {
      current[index] = nextItem;
    } else {
      current.push(nextItem);
    }

    try {
      const sanitized = stripUndefined(current);
      await updateCongres(congresId, { listSponsors: sanitized });
      setCongres((prev) => (prev ? { ...prev, listSponsors: sanitized } : prev));
      setError(null);
      pushStatus(index != null && index >= 0 ? 'Sponsor mis a jour.' : 'Sponsor ajoute.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur pendant la sauvegarde du sponsor.';
      setStatus(null);
      setError(message);
      throw err;
    }
  }, [congres, congresId, isAdmin, pushStatus]);

  const handleDeleteSponsor = useCallback(async (item: SponsorUiItem) => {
    if (!isAdmin) {
      throw new Error('Action reservee aux admins.');
    }
    if (!congresId) {
      throw new Error('Aucun congres selectionne.');
    }
    const current = [...(congres?.listSponsors ?? [])];
    if (item._index < 0 || item._index >= current.length) {
      throw new Error('Sponsor introuvable.');
    }
    const [removed] = current.splice(item._index, 1);
    try {
      const sanitized = stripUndefined(current);
      await updateCongres(congresId, { listSponsors: sanitized });
      setCongres((prev) => (prev ? { ...prev, listSponsors: sanitized } : prev));
      setError(null);
      pushStatus('Sponsor supprime.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur pendant la suppression du sponsor.';
      setStatus(null);
      setError(message);
      throw err;
    }
    const path = (removed as any)?.logoPath;
    if (typeof path === 'string' && path.length > 0) {
      await deleteLogoAtPath(path).catch(() => undefined);
    }
  }, [congres, congresId, isAdmin, pushStatus]);

  const handleToggleBanner = useCallback(async (item: SponsorUiItem) => {
    if (!isAdmin) return;
    if (!congresId) return;
    const current = [...(congres?.listSponsors ?? [])];
    if (item._index < 0 || item._index >= current.length) {
      return;
    }
    const existing = current[item._index] as SponsorItem;
    const currentFlag = Boolean((existing as any)?.affichageBandeau ?? (existing as any)?.showBanner);
    const nextFlag = !currentFlag;
    const nextItem = {
      ...existing,
      affichageBandeau: nextFlag,
    } as SponsorItem;
    (nextItem as any).showBanner = nextFlag;
    current[item._index] = nextItem;
    try {
      const sanitized = stripUndefined(current);
      await updateCongres(congresId, { listSponsors: sanitized });
      setCongres((prev) => (prev ? { ...prev, listSponsors: sanitized } : prev));
      setError(null);
      pushStatus(nextFlag ? 'Sponsor ajoute au bandeau.' : 'Sponsor retire du bandeau.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur pendant la mise a jour du bandeau.';
      setStatus(null);
      setError(message);
    }
  }, [congres, congresId, isAdmin, pushStatus]);

  return (
    <div className='spage'>
      <div className='stoolbar'>
        <input className='search' placeholder='Rechercher un sponsor...' value={q} onChange={(event) => setQ(event.target.value)} />
        <div className='spacer' />
        {isAdmin && (
          <button className='btn-primary' onClick={() => { setEditing(null); setOpenModal(true); }}>
            + Ajouter un sponsor
          </button>
        )}
      </div>

      {status && <div className='status-banner success'>{status}</div>}
      {error && <div className='status-banner error'>{error}</div>}

      <div className='sgrid'>
        {loading && <div className='empty-state'>Chargement en cours...</div>}
        {!loading && filtered.length === 0 && <div className='empty-state'>Aucun sponsor.</div>}
        {!loading && filtered.length > 0 && filtered.map((item) => (
          <article key={item.id ?? `sponsor-${item._index}`} className='scard'>
            <div className='slogo'>
              {item.logoUrl ? (
                <img src={item.logoUrl} alt={item.title} />
              ) : (
                <div className='logo-empty'>Pas de logo</div>
              )}
            </div>
            <div className='sbody'>
              <div className='srow'>
                <div className='sname'>{item.title || 'Sponsor sans titre'}</div>
                {item.numeroStand && <div className='stier'>Stand {item.numeroStand}</div>}
              </div>
              <div className='chips'>
                {item.email && <a className='chip' href={`mailto:${item.email}`}>{item.email}</a>}
                {item.website && <a className='chip' href={item.website} target='_blank' rel='noreferrer'>Site web</a>}
                {item.bandeauURL && <a className='chip' href={item.bandeauURL} target='_blank' rel='noreferrer'>Bandeau</a>}
                {item.adresse && <span className='chip'>{item.adresse}</span>}
              </div>
              {item.description && <div className='sdesc'>{item.description}</div>}
              <div className='srow' style={{ marginTop: 8 }}>
                <div className='muted'>Affichage bandeau</div>
                {isAdmin ? (
                  <label className='switch'>
                    <input type='checkbox' checked={Boolean(item.affichageBandeau)} onChange={() => handleToggleBanner(item)} />
                    <span className='slider' />
                  </label>
                ) : (
                  <span className='muted'>{item.affichageBandeau ? 'Oui' : 'Non'}</span>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className='sactions'>
                <button className='btn-ghost sm' onClick={() => { setEditing(item); setOpenModal(true); }} aria-label='Modifier'>Modifier</button>
                <button className='btn-ghost sm danger' onClick={() => setConfirm(item)} aria-label='Supprimer'>Supprimer</button>
              </div>
            )}
          </article>
        ))}
      </div>

      <SponsorModal
        open={openModal}
        onClose={() => {
          setOpenModal(false);
          setEditing(null);
        }}
        initial={editing ? {
          id: editing.id,
          title: editing.title,
          description: editing.description,
          website: editing.website,
          email: editing.email,
          numeroStand: editing.numeroStand,
          adresse: editing.adresse,
          bandeauURL: editing.bandeauURL,
          affichageBandeau: editing.affichageBandeau,
          logoUrl: editing.logoUrl,
          logoPath: editing.logoPath,
          imageUrlLogo: editing.imageUrlLogo,
        } : null}
        onSubmit={(values) => handleSaveSponsor(values, editing ? editing._index : null)}
        isAdmin={isAdmin}
      />

      <Confirm
        open={!!confirm}
        onCancel={() => setConfirm(null)}
        title='Supprimer le sponsor ?'
        message={confirm ? `Le sponsor "${confirm.title}" sera supprime. Cette action est definitive.` : ''}
        onConfirm={async () => {
          if (!confirm) return;
          const target = confirm;
          setConfirm(null);
          try {
            await handleDeleteSponsor(target);
          } catch {
            // error already reported via state
          }
        }}
      />
    </div>
  );
}


