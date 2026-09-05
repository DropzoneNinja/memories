import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AlbumSummary, TvSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { TvListPane } from './TvListPane';
import { TvDetailPane } from './TvDetailPane';
import { SettingsScreen } from './SettingsScreen';

const TV_LIST_POLL_MS = 10_000;

export function Dashboard() {
  const { user } = useAuth();
  const [tvs, setTvs] = useState<TvSummary[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumsError, setAlbumsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const refreshTvs = useCallback(async () => {
    try {
      const list = await api.listTvs();
      setTvs(list);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError) setLoadError(err.message);
    }
  }, []);

  const refreshAlbums = useCallback(async () => {
    try {
      const list = await api.listAlbums();
      setAlbums(list);
      setAlbumsError(null);
    } catch (err) {
      // Non-fatal for the TV list itself — the config form just shows an
      // empty album picker with this message until Immich is connected.
      setAlbums([]);
      setAlbumsError(err instanceof ApiError ? err.message : 'Could not load albums');
    }
  }, []);

  useEffect(() => {
    refreshTvs();
    refreshAlbums();
    const interval = setInterval(refreshTvs, TV_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshTvs, refreshAlbums]);

  useEffect(() => {
    if (!selectedId && tvs.length > 0) setSelectedId(tvs[0].id);
  }, [tvs, selectedId]);

  function handlePaired(tvId: string): void {
    refreshTvs();
    setSelectedId(tvId);
  }

  function handleDeleted(tvId: string): void {
    setTvs((prev) => prev.filter((tv) => tv.id !== tvId));
    // Falling back to null lets the effect above auto-select whatever's
    // left (or show the empty state if that was the last one) instead of
    // pointing at a TV that no longer exists.
    setSelectedId((prev) => (prev === tvId ? null : prev));
  }

  const selectedTv = tvs.find((tv) => tv.id === selectedId) ?? null;

  return (
    <div className="dashboard">
      <TvListPane
        tvs={tvs}
        albums={albums}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onPaired={handlePaired}
        onDeleted={handleDeleted}
      />
      <div className="detail-pane">
        <header className="topbar">
          <span className="current-user">{user?.email}</span>
          <button type="button" className="link-button" onClick={() => setShowSettings((s) => !s)}>
            {showSettings ? 'Close settings' : 'Settings'}
          </button>
        </header>
        {loadError && <p className="form-error">{loadError}</p>}
        {showSettings ? (
          <SettingsScreen onAlbumsChanged={refreshAlbums} />
        ) : selectedTv ? (
          <TvDetailPane
            key={selectedTv.id}
            tv={selectedTv}
            albums={albums}
            albumsError={albumsError}
            onConfigSaved={refreshTvs}
          />
        ) : (
          <p className="empty-state">No TV selected — pair one using the form on the left.</p>
        )}
      </div>
    </div>
  );
}
