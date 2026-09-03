import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AlbumSummary, TvSummary } from '../api/types';
import { PairingForm } from './PairingForm';

function albumLabel(tv: TvSummary, albums: AlbumSummary[]): string {
  const id = tv.config?.albumIds[0];
  if (!id) return 'No album configured';
  return albums.find((a) => a.id === id)?.albumName ?? 'Unknown album';
}

interface Props {
  tvs: TvSummary[];
  albums: AlbumSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPaired: (tvId: string) => void;
  onDeleted: (tvId: string) => void;
}

// The left-hand TV list (PROJECT.md §4.2): every paired TV, online/
// offline status, current album at a glance.
export function TvListPane({ tvs, albums, selectedId, onSelect, onPaired, onDeleted }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(tv: TvSummary): Promise<void> {
    // A real confirm() dialog rather than a custom modal — this is a
    // rare, deliberate action (pruning stale entries from repeated
    // re-pairing, PROJECT.md's known Phase 3 behaviour) and native
    // confirm is enough friction to prevent a stray misclick, without
    // building a whole modal component for one destructive button.
    const label = `${tv.name ?? 'Unnamed TV'} (${tv.online ? 'online' : 'offline'})`;
    if (!window.confirm(`Remove "${label}"? This cannot be undone — it will need to be re-paired to come back.`)) {
      return;
    }
    setError(null);
    setDeletingId(tv.id);
    try {
      await api.deleteTv(tv.id);
      onDeleted(tv.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this TV');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <nav className="tv-list-pane">
      <h1 className="brand">Memories</h1>
      {error && <p className="form-error">{error}</p>}
      <ul className="tv-list">
        {tvs.map((tv) => (
          <li key={tv.id} className={`tv-list-item${tv.id === selectedId ? ' selected' : ''}`}>
            <button type="button" className="tv-list-item-select" onClick={() => onSelect(tv.id)}>
              <span className={`status-dot ${tv.online ? 'online' : 'offline'}`} aria-hidden="true" />
              <span className="tv-list-item-text">
                <span className="tv-name">{tv.name ?? 'Unnamed TV'}</span>
                <span className="tv-album">{albumLabel(tv, albums)}</span>
              </span>
            </button>
            <button
              type="button"
              className="tv-list-item-delete"
              title="Remove this TV"
              disabled={deletingId === tv.id}
              onClick={() => handleDelete(tv)}
            >
              ×
            </button>
          </li>
        ))}
        {tvs.length === 0 && <li className="hint">No TVs paired yet.</li>}
      </ul>
      <PairingForm onPaired={onPaired} />
    </nav>
  );
}
