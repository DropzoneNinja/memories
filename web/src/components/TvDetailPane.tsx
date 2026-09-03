import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type {
  AlbumSummary,
  AssetLocation,
  Configuration,
  Presentation,
  PresentationAsset,
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

// A composition can be 1-3 images (PROJECT.md §5.2's composition engine
// — single/two-portrait/three-portrait). `presentation.assets` isn't
// guaranteed to already be in left-to-right slot order, so this resolves
// each slot to its asset explicitly by id — the same approach the TV's
// own PresentationRenderer uses, and the same bug class as its original
// "only ever renders assets[0]" issue from Phase 4, just here instead of
// there.
function slotAssets(presentation: Presentation | null | undefined): PresentationAsset[] {
  if (!presentation) return [];
  const byId = new Map(presentation.assets.map((a) => [a.id, a]));
  return presentation.layout.slots.map((slot) => byId.get(slot.assetId)).filter((a): a is PresentationAsset => Boolean(a));
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
  const featuredSlots = slotAssets(featured);
  // The map/location shows the composition's first (leftmost) photo —
  // a 2/3-up composition's photos are near-always taken moments apart in
  // the same place, and picking one keeps the map to one marker rather
  // than needing its own per-photo click target.
  const primaryAsset = featuredSlots[0] ?? null;

  // Location is fetched on demand per focused asset (never part of
  // Presentation/TvDetail — the TV must never receive it, PROJECT.md
  // §5.7/§13) and follows whichever photo is featured: the current one
  // by default, whatever the user clicked in the "next" strip otherwise,
  // and back to current when they click the featured photo itself.
  useEffect(() => {
    if (!primaryAsset) {
      setLocation(null);
      setLocationLoading(false);
      return;
    }
    let cancelled = false;
    setLocationLoading(true);
    api
      .getAssetLocation(primaryAsset.id)
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
  }, [primaryAsset?.id]);

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
        {featured && featuredSlots.length > 0 ? (
          <>
            <button
              type="button"
              className="current-image-frame"
              style={{ background: featured.background.colour }}
              onClick={() => setSelectedNextIndex(null)}
              title={selectedNextIndex !== null ? 'Back to the currently displaying photo' : 'Currently displaying'}
            >
              {featuredSlots.map((asset) => (
                <img key={asset.id} src={api.resolveAssetUrl(asset.url)} alt="" />
              ))}
            </button>
            <div className="exif">
              <p className="album">{featuredSlots[0].metadata.album}</p>
              {featuredSlots.map((asset) => (
                <div key={asset.id} className="exif-asset">
                  <p className="filename">{asset.metadata.filename}</p>
                  {exifLines(asset.metadata).map((line) => (
                    <p key={line} className="exif-line">
                      {line}
                    </p>
                  ))}
                </div>
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
            const slots = slotAssets(item);
            if (slots.length === 0) return null;
            return (
              <button
                key={item.presentationId}
                type="button"
                className={`thumbnail${selectedNextIndex === i ? ' selected' : ''}`}
                onClick={() => setSelectedNextIndex(i)}
                title="Show this photo's details and location above"
              >
                {slots.map((asset) => (
                  <img key={asset.id} src={api.resolveAssetUrl(asset.url)} alt="" />
                ))}
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
