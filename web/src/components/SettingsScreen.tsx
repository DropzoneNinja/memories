import { useAuth } from '../auth/AuthContext';
import { ImmichSettings } from './ImmichSettings';
import { ChangePasswordForm } from './ChangePasswordForm';
import { AdminUserManagement } from './AdminUserManagement';

interface Props {
  onAlbumsChanged: () => void;
}

// Replaces the old Immich-only settings panel — a general account/admin
// settings screen (Dashboard.tsx's "Settings" toggle). Every user gets
// their own account section (Immich key, change password, sign out);
// admins additionally get user management below it.
export function SettingsScreen({ onAlbumsChanged }: Props) {
  const { user, logout } = useAuth();

  return (
    <div className="settings-screen">
      <section className="settings-section">
        <h2>Your Account</h2>
        <p className="hint">
          Signed in as {user?.email}
          {user?.isAdmin && ' (admin)'}
        </p>

        <ImmichSettings onChanged={onAlbumsChanged} />

        <h3>Change Password</h3>
        <ChangePasswordForm />

        <button type="button" className="link-button" onClick={logout}>
          Sign out
        </button>
      </section>

      {user?.isAdmin && (
        <section className="settings-section">
          <h2>Admin</h2>
          <AdminUserManagement />
        </section>
      )}
    </div>
  );
}
