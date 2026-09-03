import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import type {
  AlbumSummary,
  Configuration,
  ConfigInput,
  DisconnectedBehavior,
  MatMode,
  PlaybackMode,
  TvSummary,
} from '../api/types';

const MAT_MODES: MatMode[] = [
  'AUTOMATIC',
  'NEUTRAL',
  'WARM',
  'COOL',
  'DARK',
  'LIGHT',
  'COMPLEMENTARY',
  'ANALOGOUS',
  'WHITE',
  'BLACK',
  'WOOD',
];
const PLAYBACK_MODES: PlaybackMode[] = ['SEQUENTIAL', 'SHUFFLE'];
const DISCONNECTED_BEHAVIORS: DisconnectedBehavior[] = ['CONTINUE_QUEUE', 'REPEAT_QUEUE', 'FREEZE'];

interface Props {
  tv: TvSummary;
  albums: AlbumSummary[];
  onSaved: (config: Configuration) => void;
}

// PUT .../config bumps the config version, regenerates the queue, and
// the TV picks up the change on its next playlist fetch (PROJECT.md
// §5.10) — "Save" here really does mean "push to TV."
export function ConfigForm({ tv, albums, onSaved }: Props) {
  const config = tv.config;
  const [albumId, setAlbumId] = useState(config?.albumIds[0] ?? '');
  const [intervalSeconds, setIntervalSeconds] = useState(config?.intervalSeconds ?? 600);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(config?.playbackMode ?? 'SHUFFLE');
  const [matMode, setMatMode] = useState<MatMode>(config?.matMode ?? 'AUTOMATIC');
  const [disconnectedBehavior, setDisconnectedBehavior] = useState<DisconnectedBehavior>(
    config?.disconnectedBehavior ?? 'CONTINUE_QUEUE',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setJustSaved(false);
    setSaving(true);
    try {
      const body: ConfigInput = {
        albumIds: albumId ? [albumId] : [],
        intervalSeconds,
        playbackMode,
        matMode,
        disconnectedBehavior,
      };
      const result = await api.updateConfig(tv.id, body);
      onSaved(result);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="config-form" onSubmit={handleSubmit}>
      <h3>Configuration</h3>
      <label>
        Album
        <select value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
          <option value="">— none —</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.albumName} ({a.assetCount})
            </option>
          ))}
        </select>
      </label>
      <label>
        Interval (seconds)
        <input
          type="number"
          min={5}
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
        />
      </label>
      <label>
        Playback
        <select value={playbackMode} onChange={(e) => setPlaybackMode(e.target.value as PlaybackMode)}>
          {PLAYBACK_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mat
        <select value={matMode} onChange={(e) => setMatMode(e.target.value as MatMode)}>
          {MAT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        If disconnected
        <select
          value={disconnectedBehavior}
          onChange={(e) => setDisconnectedBehavior(e.target.value as DisconnectedBehavior)}
        >
          {DISCONNECTED_BEHAVIORS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save / Push to TV'}
        </button>
        {justSaved && !saving && <span className="saved-flash">Saved</span>}
      </div>
    </form>
  );
}
