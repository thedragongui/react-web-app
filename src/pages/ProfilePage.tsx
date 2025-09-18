import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { watchMyProfile, upsertMyProfile, type Personne } from '../firestore/firestoreApi';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  EmailAuthProvider, reauthenticateWithCredential,
  updateEmail as fbUpdateEmail, updatePassword as fbUpdatePassword
} from 'firebase/auth';
import './profile.css';

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]/g, '_');
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Personne | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Champs éditables
  const [displayName, setDisplayName] = useState('');
  const [compagnie, setCompagnie] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = watchMyProfile(user, (p) => {
      setProfile(p);
      setDisplayName((p?.displayName ?? '') as string);
      setCompagnie((p?.compagnie ?? '') as string);
      setLoading(false);
    });
    return () => unsub && unsub();
  }, [user]);

  const canSave = useMemo(() => !!user && (displayName.trim().length > 0 || (profile?.displayName ?? '') !== displayName || (profile?.compagnie ?? '') !== compagnie), [user, displayName, profile, compagnie]);

  async function saveProfile() {
    if (!user) return;
    setErr(null); setSaveMsg(null);
    try {
      await upsertMyProfile(user, {
        displayName: displayName.trim() || undefined,
        compagnie: compagnie.trim() || undefined,
      });
      setSaveMsg('Profil enregistré ✅');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!user || !file) return;
    setErr(null); setSaveMsg('Téléversement de la photo…');
    try {
      if (!file.type.startsWith('image/')) {
        setErr('Veuillez choisir une image.'); setSaveMsg(null); return;
      }
      // Upload dans photos/{uid}/
      const path = `photos/${user.uid}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const r = ref(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);

      // Si ancien chemin connu → suppression (meilleure hygiène)
      const oldPath = profile?.photoPath;
      await upsertMyProfile(user, { photoURL: url, photoPath: path });

      if (oldPath && oldPath !== path) {
        try { await deleteObject(ref(storage, oldPath)); } catch { /* silencieux */ }
      }
      setSaveMsg('Photo mise à jour ✅');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e: any) {
      setErr(e?.message ?? String(e)); setSaveMsg(null);
    } finally {
      e.currentTarget.value = '';
    }
  }

  // ---- Compte (email / mot de passe)
  const [currentPwd, setCurrentPwd] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);

  async function reauth() {
    if (!user?.email) throw new Error("Session invalide ; reconnectez-vous.");
    const cred = EmailAuthProvider.credential(user.email, currentPwd);
    await reauthenticateWithCredential(user, cred);
  }

  async function changeEmail() {
    if (!user) return;
    setErr(null); setEmailMsg(null);
    try {
      await reauth();
      await fbUpdateEmail(user, newEmail.trim());
      await upsertMyProfile(user, { email: newEmail.trim() }); // garder sync
      setEmailMsg('Email mis à jour ✅');
      setTimeout(() => setEmailMsg(null), 2500);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function changePassword() {
    if (!user) return;
    setErr(null); setPwdMsg(null);
    try {
      await reauth();
      await fbUpdatePassword(user, newPwd);
      setPwdMsg('Mot de passe mis à jour ✅');
      setTimeout(() => setPwdMsg(null), 2500);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  if (!user) return <div className="profile-page">Veuillez vous connecter.</div>;

  return (
    <div className="profile-page">
      <div className="cards">
        <section className="card">
          <h3>Mon profil</h3>
          {loading ? <div className="hint">Chargement…</div> : (
            <>
              <div className="profile-row">
                <div className="avatar">
                  {profile?.photoURL
                    ? <img src={profile.photoURL} alt="Avatar" />
                    : <div className="avatar-empty">Aucun avatar</div>}
                </div>
                <div className="avatar-actions">
                  <label className="btn-ghost">
                    Changer la photo
                    <input type="file" accept="image/*" hidden onChange={onPickAvatar} />
                  </label>
                  <div className="hint">Stocké dans <code>photos/{user.uid}/…</code></div>
                </div>
              </div>

              <div className="grid-2">
                <label className="field">
                  <span>Nom affiché</span>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Votre nom" />
                </label>
                <label className="field">
                  <span>Compagnie / Organisation</span>
                  <input value={compagnie} onChange={(e) => setCompagnie(e.target.value)} placeholder="Ex. ACME" />
                </label>
              </div>

              <div className="meta">
                <div><b>UID :</b> <code>{user.uid}</code></div>
                <div><b>Email (auth) :</b> {user.email ?? '—'}</div>
              </div>

              {err && <div className="error">{err}</div>}
              {saveMsg && <div className="ok">{saveMsg}</div>}

              <div className="actions">
                <button className="btn-primary" onClick={saveProfile} disabled={!canSave}>Enregistrer</button>
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h3>Compte</h3>

          <div className="grid-2">
            <label className="field">
              <span>Mot de passe actuel *</span>
              <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} placeholder="Requis pour modifier" />
            </label>
            <div />
          </div>

          <div className="block">
            <div className="block-title">Changer d’email</div>
            <div className="grid-2">
              <label className="field">
                <span>Nouvel email</span>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="nouvel.email@exemple.com" />
              </label>
              <div className="actions-right">
                <button className="btn-ghost" onClick={changeEmail} disabled={!currentPwd || !newEmail}>Mettre à jour</button>
              </div>
            </div>
            {emailMsg && <div className="ok">{emailMsg}</div>}
          </div>

          <div className="block">
            <div className="block-title">Changer le mot de passe</div>
            <div className="grid-2">
              <label className="field">
                <span>Nouveau mot de passe</span>
                <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="••••••••" />
              </label>
              <div className="actions-right">
                <button className="btn-ghost" onClick={changePassword} disabled={!currentPwd || newPwd.length < 6}>Mettre à jour</button>
              </div>
            </div>
            {pwdMsg && <div className="ok">{pwdMsg}</div>}
          </div>

          <div className="hint">Certaines opérations exigent une <b>ré-authentification</b> (mot de passe actuel).</div>
        </section>
      </div>
    </div>
  );
}
