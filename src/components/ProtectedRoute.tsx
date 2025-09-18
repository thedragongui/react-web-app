import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { JSX } from 'react';

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{padding:24}}>Chargement…</div>;
  if (!user) return <Navigate to="/signin" replace />;
  return children;
}
