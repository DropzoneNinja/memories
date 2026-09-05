import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { ForcedPasswordChange } from './components/ForcedPasswordChange';

function Root() {
  const { user, loading } = useAuth();

  if (loading) return <div className="full-page-status">Loading…</div>;
  if (!user) return <LoginScreen />;
  // A temp password (account creation or an admin reset) must be changed
  // before anything else — the API enforces this server-side too (see
  // auth/middleware.ts), this is just what makes it legible in the UI.
  if (user.mustChangePassword) return <ForcedPasswordChange />;
  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
