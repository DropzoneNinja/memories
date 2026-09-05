import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// Per-user Immich account connection — each household member
// pastes their own Immich API key here so the album picker (Dashboard's
// listAlbums call) shows their own library instead of one shared account
// from .env. The key itself is verified against Immich before saving
// (api/src/routes/settings.ts) and is never sent back to the browser
// afterwards — only whether one is connected and its last 4 characters.
interface Props {
  // Called after a successful save or disconnect, so the caller can
  // re-fetch the album list under the (now different) Immich account.
  onChanged: () => void;
}

export function ImmichSettings({ onChanged }: Props) {
  const { user, setUser } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setJustSaved(false);
    setSaving(true);
    try {
      const updated = await api.updateImmichKey(apiKey);
      setUser(updated);
      setApiKey('');
      setJustSaved(true);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect(): Promise<void> {
    setError(null);
    setJustSaved(false);
    setDisconnecting(true);
    try {
      const updated = await api.disconnectImmich();
      setUser(updated);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <form className="config-form immich-settings" onSubmit={handleSubmit}>
      <h3>Immich Account</h3>
      <p className="hint">
        Connect your own Immich API key to pick albums from your own library. Generate one from
        Immich under Account Settings → API Keys.
      </p>
      {user?.immichConnected ? (
        <p className="key-status connected">Connected — key ending in ••{user.immichKeyLast4}</p>
      ) : (
        <p className="key-status disconnected">Not connected</p>
      )}
      <label>
        {user?.immichConnected ? 'Replace API key' : 'API key'}
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          placeholder="Paste your Immich API key"
        />
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving || !apiKey}>
          {saving ? 'Verifying…' : 'Save'}
        </button>
        {user?.immichConnected && (
          <button
            type="button"
            className="link-button"
            onClick={handleDisconnect}
            disabled={disconnecting || saving}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        )}
        {justSaved && !saving && <span className="saved-flash">Connected</span>}
      </div>
    </form>
  );
}
