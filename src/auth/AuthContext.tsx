import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, getIdTokenResult, type User } from 'firebase/auth';
import { auth } from '../firebase';

type AuthContextType = { user: User | null; loading: boolean; isAdmin: boolean };

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const lastAdminClaimRef = useRef<boolean | null>(null);
  const lastSignInTimeRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setUser(currentUser);

      if (!currentUser) {
        lastAdminClaimRef.current = null;
        lastSignInTimeRef.current = null;
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const currentSignInTime = currentUser.metadata?.lastSignInTime ?? null;
        const signInChanged =
          lastSignInTimeRef.current !== null && currentSignInTime !== lastSignInTimeRef.current;

        let token = await getIdTokenResult(currentUser);
        let adminFlag = !!token.claims?.admin;
        const claimMissing = typeof token.claims?.admin === 'undefined';
        const claimChanged =
          lastAdminClaimRef.current !== null && adminFlag !== lastAdminClaimRef.current;

        if (claimMissing || claimChanged || signInChanged) {
          token = await getIdTokenResult(currentUser, true);
          adminFlag = !!token.claims?.admin;
        }

        lastAdminClaimRef.current = adminFlag;
        lastSignInTimeRef.current = currentSignInTime;
        setIsAdmin(adminFlag);
      } catch (error) {
        console.error('[AuthProvider] Failed to refresh token claims', error);
        lastAdminClaimRef.current = null;
        lastSignInTimeRef.current = null;
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
