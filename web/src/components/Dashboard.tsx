import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AlbumSummary, TvSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { TvListPane } from './TvListPane';
import { TvDetailPane } from './TvDetailPane';

const TV_LIST_POLL_MS = 10_000;

export function Dashboard() {
  const { user, logout } = useAuth();
  const [tvs, setTvs] = useState<TvSummary[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshTvs = useCallback(async () => {
    try {
      const list = await api.listTvs();
      setTvs(list);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError) setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    refreshTvs();
    api
      .listAlbums()
      .then(setAlbums)
      .catch(() => {
        // Non-fatal for the TV list itself — the config form will just
        // show an empty album picker until this resolves.
      });
    const interval = setInterval(refreshTvs, TV_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshTvs]);

  useEffect(() => {
    if (!selectedId && tvs.length > 0) setSelectedId(tvs[0].id);
  }, [tvs, selectedId]);

  function handlePaired(tvId: string): void {
    refreshTvs();
    setSelectedId(tvId);
  }

  const selectedTv = tvs.find((tv) => tv.id === selectedId) ?? null;

  return (
    <div className="dashboard">
      <TvListPane tvs={tvs} albums={albums} selectedId={selectedId} onSelect={setSelectedId} onPaired={handlePaired} />
      <div className="detail-pane">
        <header className="topbar">
          <span className="current-user">{user?.email}</span>
          <button type="button" className="link-button" onClick={logout}>
            Sign out
          </button>
        </header>
        {loadError && <p className="form-error">{loadError}</p>}
        {selectedTv ? (
          <TvDetailPane key={selectedTv.id} tv={selectedTv} albums={albums} onConfigSaved={refreshTvs} />
        ) : (
          <p className="empty-state">No TV selected — pair one using the form on the left.</p>
        )}
      </div>
    </div>
  );
}
