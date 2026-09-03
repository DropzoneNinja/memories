import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type {
  AlbumSummary,
  AssetLocation,
  Configuration,
  Presentation,
  PresentationAssetMetadata,
  TvDetail,
  TvSummary,
} from '../api/types';
import { ConfigForm } from './ConfigForm';
import { TransportControls } from './TransportControls';
import { LocationMap } from './LocationMap';

// Independent of the TV list's own poll (Dashboard.tsx) — this pane
// wants a tighter loop for "currently displaying" to feel reasonably
// live without needing Phase 7's WebSocket push channel.
const DETAIL_POLL_MS = 8_000;

interface Props {
  tv: TvSummary;
  albums: AlbumSummary[];
  onConfigSaved: () => void;
}

function exifLines(metadata: PresentationAssetMetadata): string[] {
  const lines: string[] = [];
  if (metadata.camera) lines.push([metadata.camera, metadata.lens].filter(Boolean).join(' · '));
  const exposure = [
    metadata.fNumber ? `f/${metadata.fNumber}` : null,
    metadata.exposureTime ? `${metadata.exposureTime}s` : null,
    metadata.iso ? `ISO ${metadata.iso}` : null,
    metadata.focalLength ? `${metadata.focalLength}mm` : null,
  ].filter((v): v is string => Boolean(v));
  if (exposure.length > 0) lines.push(exposure.join(' · '));
  if (metadata.takenAt) lines.push(new Date(metadata.takenAt).toLocaleString());
  return lines;
}

function locationLabel(location: AssetLocation | null): string | null {
  if (!location) return null;
  return [location.city, location.state, location.country].filter(Boolean).join(', ') || null;
}

function firstAsset(presentation: Presentation | null | undefined) {
  return presentation?.assets[0] ?? null;
}

export function TvDetailPane({ tv, albums, onConfigSaved }: Props) {
  const [detail, setDetail] = useState<TvDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = the current photo is featured (the default, and what
  // clicking the featured photo itself resets back to); an index into
  // detail.next = that upcoming photo is featured instead.
  const [selectedNextIndex, setSelectedNextIndex] = useState<number | null>(null);
  const [location, setLocation] = useState<AssetLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await api.getTv(tv.id);
      setDetail(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }, [tv.id]);

  useEffect(() => {
    setDetail(null);
    setSelectedNextIndex(null);
    refresh();
    const interval = setInterval(refresh, DETAIL_POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  function handleConfigSaved(config: Configuration): void {
    setDetail((prev) => (prev ? { ...prev, config } : prev));
    onConfigSaved();
  }

  // Freshest online/paused come from this pane's own tighter poll once
  // it has landed; fall back to the list's slower-polled values until
  // then, so the transport controls aren't stuck disabled/guessing on
  // first render.
  const effectiveTv: TvSummary = detail ? { ...tv, online: detail.online, paused: detail.paused } : tv;

  const featured = selectedNextIndex !== null ? (detail?.next[selectedNextIndex] ?? null) : (detail?.current ?? null);
  const featuredAsset = firstAsset(featured);

  // Location is fetched on demand per focused asset (never part of
  // Presentation/TvDetail — the TV must never receive it, PROJECT.md
  // §5.7/§13) and follows whichever photo is featured: the current one
  // by default, whatever the user clicked in the "next" strip otherwise,
  // and back to current when they click the featured photo itself.
  useEffect(() => {
    if (!featuredAsset) {
      setLocation(null);
      setLocationLoading(false);
      return;
    }
    let cancelled = false;
    setLocationLoading(true);
    api
      .getAssetLocation(featuredAsset.id)
      .then((result) => {
        if (!cancelled) setLocation(result);
      })
      .catch(() => {
        if (!cancelled) setLocation(null);
      })
      .finally(() => {
        if (!cancelled) setLocationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [featuredAsset?.id]);

  return (
    <div className="tv-detail-pane">
      <header className="tv-header">
        <h2>{tv.name ?? 'Unnamed TV'}</h2>
        <span className={`status-pill ${effectiveTv.online ? 'online' : 'offline'}`}>
          {effectiveTv.online ? 'Online' : 'Offline'}
        </span>
      </header>

      {error && <p className="form-error">{error}</p>}

      <section className="current-image">
        {featured && featuredAsset ? (
          <>
            <button
              type="button"
              className="current-image-frame"
              style={{ background: featured.background.colour }}
              onClick={() => setSelectedNextIndex(null)}
              title={selectedNextIndex !== null ? 'Back to the currently displaying photo' : 'Currently displaying'}
            >
              <img src={api.resolveAssetUrl(featuredAsset.url)} alt="" />
            </button>
            <div className="exif">
              <p className="filename">{featuredAsset.metadata.filename}</p>
              <p className="album">{featuredAsset.metadata.album}</p>
              {exifLines(featuredAsset.metadata).map((line) => (
                <p key={line} className="exif-line">
                  {line}
                </p>
              ))}
              {selectedNextIndex !== null && <p className="hint">Showing an upcoming photo — click it to return.</p>}
            </div>
            <LocationMap
              latitude={location?.latitude ?? null}
              longitude={location?.longitude ?? null}
              label={locationLabel(location)}
              loading={locationLoading}
            />
          </>
        ) : (
          <p className="empty-state">Nothing reported as displaying yet.</p>
        )}
      </section>

      <TransportControls tv={effectiveTv} />

      <section className="next-strip">
        <h3>Next</h3>
        <div className="thumbnail-row">
          {(detail?.next ?? []).map((item, i) => {
            const asset = firstAsset(item);
            if (!asset) return null;
            return (
              <button
                key={item.presentationId}
                type="button"
                className={`thumbnail${selectedNextIndex === i ? ' selected' : ''}`}
                onClick={() => setSelectedNextIndex(i)}
                title="Show this photo's details and location above"
              >
                <img src={api.resolveAssetUrl(asset.url)} alt="" />
              </button>
            );
          })}
          {(!detail || detail.next.length === 0) && <p className="hint">Queue is empty.</p>}
        </div>
      </section>

      <ConfigForm tv={tv} albums={albums} onSaved={handleConfigSaved} />
    </div>
  );
}
