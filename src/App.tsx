import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';                  // ✔ AuthContext à la racine
import ProtectedRoute from './components/ProtectedRoute';      // ✔ composant
import SignIn from './pages/SignIn';
import Dashboard from './pages/Dashboard';

import AppShell from './layout/AppShell';
import ProgrammePage from './pages/ProgrammePage';
import SponsorsPage from './pages/SponsorsPage';
import ParticipantsPage from './pages/ParticipantsPage';
import BadgesPage from './pages/BadgesPage';
import ImportationPdfPage from './pages/ImportationPdfPage';
import LinksPage from './pages/LinksPage';
import ProfilePage from './pages/ProfilePage';

// (option) tes pages de démo, accessibles mais pas dans la sidebar
import FirestoreDemo from './pages/FirestoreDemo';
import StorageDemo from './pages/StorageDemo';
import ConfigApp from './pages/ConfigApp';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* connexion */}
          <Route path="/signin" element={<SignIn />} />

          {/* espace protégé */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="configuration" element={<ConfigApp />} />
            <Route path="programme" element={<ProgrammePage />} />
            <Route path="sponsors" element={<SponsorsPage />} />
            <Route path="participants" element={<ParticipantsPage />} />
            <Route path="badges" element={<BadgesPage />} />
            <Route path="importation-pdf" element={<ImportationPdfPage />} />
            <Route path="liens" element={<LinksPage />} />
            <Route path="profil" element={<ProfilePage />} />

            {/* routes de démo (cachées du menu) */}
            <Route path="dev/firestore" element={<FirestoreDemo />} />
            <Route path="dev/storage" element={<StorageDemo />} />
          </Route>

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
