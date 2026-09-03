import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';

function Root() {
  const { user, loading } = useAuth();

  if (loading) return <div className="full-page-status">Loading…</div>;
  return user ? <Dashboard /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
