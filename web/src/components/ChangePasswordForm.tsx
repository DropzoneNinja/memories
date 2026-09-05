import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Props {
  onChanged?: () => void;
}

// Shared by SettingsScreen (voluntary) and ForcedPasswordChange (mandatory
// after account creation or an admin reset) — the form and API call are
// identical either way, only the surrounding copy differs.
export function ChangePasswordForm({ onChanged }: Props) {
  const { setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setJustSaved(false);

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.changePassword(currentPassword, newPassword);
      setUser(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setJustSaved(true);
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Password change failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="config-form" onSubmit={handleSubmit}>
      <label>
        Current password
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Change password'}
        </button>
        {justSaved && !saving && <span className="saved-flash">Changed</span>}
      </div>
    </form>
  );
}
