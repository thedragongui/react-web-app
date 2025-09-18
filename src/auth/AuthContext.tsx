import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getIdTokenResult } from 'firebase/auth';

import { auth } from '../firebase';

type AuthContextType = { user: User | null; loading: boolean; isAdmin: boolean; };
const AuthContext = createContext<AuthContextType>({ user: null, loading: true, isAdmin: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // force refresh du token pour récupérer les claims à jour
        const result = await getIdTokenResult(u, true);
        setIsAdmin(!!result.claims?.admin);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return <AuthContext.Provider value={{ user, loading, isAdmin }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);