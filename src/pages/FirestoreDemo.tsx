import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  getCongres, watchParticipants, getMyProfile, upsertMyProfile,
  addEvenement, addSponsor
} from '../firestore/firestoreApi';
import { DEFAULT_CONGRES_ID } from '../lib/congresId';


export default function FirestoreDemo() {
  const { user, isAdmin } = useAuth();
  const [congresId, setCongresId] = useState(DEFAULT_CONGRES_ID); // valeur par défaut vue en capture
  const [congres, setCongres] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Charge le congrès (public)
  useEffect(() => {
    (async () => {
      setMsg('Chargement congrès…');
      const c = await getCongres(congresId);
      setCongres(c);
      setMsg(null);
    })();
  }, [congresId]);

  // Liste + abonnement live des participants (auth requis)
  useEffect(() => {
    if (!user) return;
    let unsub = watchParticipants(congresId, setParticipants);
    return () => unsub && unsub();
  }, [user, congresId]);

  // Mon profil (personne/{uid})
  useEffect(() => {
    (async () => {
      if (!user) return;
      const p = await getMyProfile(user);
      setProfile(p);
    })();
  }, [user]);

  async function saveProfile() {
    if (!user) return;
    await upsertMyProfile(user, { ...profile });
    alert('Profil enregistré');
  }

  async function createEvenement() {
    if (!isAdmin) return alert('Réservé aux admins côté UI');
    await addEvenement({ title: 'Nouvel évènement', date: new Date().toISOString() });
    alert('Évènement créé');
  }

  async function createSponsor() {
    if (!isAdmin) return alert('Réservé aux admins côté UI');
    await addSponsor({ name: 'Sponsor X' });
    alert('Sponsor créé');
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Firestore — Démo</h2>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>
          Congrès ID&nbsp;
          <input value={congresId} onChange={e => setCongresId(e.target.value)} />
        </label>
        <span>Connecté: <strong>{user?.email ?? '—'}</strong> {isAdmin ? '(admin)' : ''}</span>
      </div>

      {msg && <p>{msg}</p>}

      <section style={{ border: '1px solid #eee', padding: 12, borderRadius: 12, marginBottom: 16 }}>
        <h3>Congrès (lecture publique)</h3>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(congres ?? {}, null, 2)}</pre>
      </section>

      <section style={{ border: '1px solid #eee', padding: 12, borderRadius: 12, marginBottom: 16 }}>
        <h3>Participants de {congresId} (auth requis)</h3>
        <ul>
          {participants.map(p => (
            <li key={p.idDoc}>
              {p.id ?? p.idDoc} — {p.email ?? '—'} — {p.category ?? '—'}
            </li>
          ))}
          {participants.length === 0 && <li>Aucun</li>}
        </ul>
      </section>

      <section style={{ border: '1px solid #eee', padding: 12, borderRadius: 12, marginBottom: 16 }}>
        <h3>Mon profil (personne/{user?.uid})</h3>
        {!user ? (
          <p>Connecte-toi pour voir/éditer ton profil.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
              <label>Email <input
                value={profile?.email ?? user.email ?? ''}
                onChange={(e)=>setProfile((s:any)=>({...(s||{}), email:e.target.value}))}
              /></label>
              <label>Nom affiché <input
                value={profile?.displayName ?? ''}
                onChange={(e)=>setProfile((s:any)=>({...(s||{}), displayName:e.target.value}))}
              /></label>
              <label>Compagnie <input
                value={profile?.compagnie ?? ''}
                onChange={(e)=>setProfile((s:any)=>({...(s||{}), compagnie:e.target.value}))}
              /></label>
              <button onClick={saveProfile}>Enregistrer</button>
            </div>
          </>
        )}
      </section>

      {isAdmin && (
        <section style={{ border: '1px solid #eee', padding: 12, borderRadius: 12 }}>
          <h3>Actions admin (contrôle UI)</h3>
          <button onClick={createEvenement} style={{ marginRight: 8 }}>Créer évènement</button>
          <button onClick={createSponsor}>Créer sponsor</button>
        </section>
      )}
    </div>
  );
}
