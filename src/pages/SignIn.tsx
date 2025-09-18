import { type FormEvent, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../auth/AuthContext';

export default function SignIn() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ⚠️ Si déjà connecté, ou dès que la connexion réussit → on va au dashboard
  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // La redirection se fera via l'effet ci-dessus
    } catch (e: any) {
      setErr(e.code ? `${e.code} — ${e.message}` : e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: '10vh auto', padding: 24, border: '1px solid #e5e7eb', borderRadius: 12 }}>
      <h1>Connexion</h1>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Email
          <input style={{ width: '100%' }} type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input style={{ width: '100%' }} type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>{loading? 'Connexion…' : 'Se connecter'}</button>
      </form>
      {err && <p style={{ color: 'crimson', marginTop: 8 }}>{err}</p>}
    </div>
  );
}
