import { useAuth } from '../auth/AuthContext';
import { ChangePasswordForm } from './ChangePasswordForm';

// Shown instead of the dashboard whenever `user.mustChangePassword` is
// true (App.tsx) — after account creation or an admin-triggered reset.
// The API enforces this too (every other dashboard route 403s with
// PASSWORD_CHANGE_REQUIRED until this succeeds, see
// api/src/auth/middleware.ts) — this screen is what makes that
// enforcement legible rather than a dead end of failed requests.
export function ForcedPasswordChange() {
  const { logout } = useAuth();

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Memories</h1>
        <p className="hint">
          Your password was just set by an administrator. Choose a new one before continuing.
        </p>
        <ChangePasswordForm />
        <button type="button" className="link-button" onClick={logout}>
          Sign out instead
        </button>
      </div>
    </div>
  );
}
