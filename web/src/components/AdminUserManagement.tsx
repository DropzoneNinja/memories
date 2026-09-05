import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type { AdminUserSummary } from '../api/types';

// Admin-only account management (routes/admin.ts) — register a new
// household member and reset a forgotten password. Both actions generate
// a temporary password server-side and return it exactly once; there's no
// way to retrieve it again afterward, so it's shown here in a dismissable
// reveal banner with a clear "won't be shown again" warning, meant to be
// copied and handed off to that person out-of-band (message, in person,
// etc.) — never emailed/logged anywhere by the app itself.
interface Reveal {
  email: string;
  tempPassword: string;
}

function Badge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

export function AdminUserManagement() {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.adminListUsers();
      setUsers(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load users');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleRegister(event: FormEvent): Promise<void> {
    event.preventDefault();
    setRegisterError(null);
    setRegistering(true);
    try {
      const result = await api.adminCreateUser(email);
      setReveal({ email: result.user.email, tempPassword: result.tempPassword });
      setEmail('');
      await refresh();
    } catch (err) {
      setRegisterError(err instanceof ApiError ? err.message : 'Could not create user');
    } finally {
      setRegistering(false);
    }
  }

  async function handleReset(user: AdminUserSummary): Promise<void> {
    setResettingId(user.id);
    try {
      const result = await api.adminResetPassword(user.id);
      setReveal({ email: result.user.email, tempPassword: result.tempPassword });
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not reset password');
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div className="admin-section">
      {reveal && (
        <div className="temp-credential-banner">
          <p>
            Temporary password for <strong>{reveal.email}</strong>:
          </p>
          <p className="temp-credential-value">{reveal.tempPassword}</p>
          <p className="hint">
            Share this with them now — it won&rsquo;t be shown again. They&rsquo;ll be required to
            change it the first time they sign in.
          </p>
          <button type="button" className="link-button" onClick={() => setReveal(null)}>
            Done
          </button>
        </div>
      )}

      <form className="config-form" onSubmit={handleRegister}>
        <h3>Register New User</h3>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        {registerError && <p className="form-error">{registerError}</p>}
        <div className="form-actions">
          <button type="submit" disabled={registering}>
            {registering ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>

      <div className="user-list">
        <h3>Users</h3>
        {loadError && <p className="form-error">{loadError}</p>}
        <table className="user-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td className="user-badges">
                  {u.isAdmin && <Badge label="Admin" tone="neutral" />}
                  {u.immichConnected && <Badge label="Immich connected" tone="ok" />}
                  {u.mustChangePassword && <Badge label="Password pending" tone="warn" />}
                </td>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleReset(u)}
                    disabled={resettingId === u.id}
                  >
                    {resettingId === u.id ? 'Resetting…' : 'Reset password'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
