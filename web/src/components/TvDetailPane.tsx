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

// A composition can be 1-9 images (PROJECT.md §5.2's composition engine —
// single/two-portrait/three-portrait/collage). `presentation.assets` isn't
// guaranteed to already be in left-to-right slot order, so this resolves
// each slot to its asset explicitly by id — the same approach the TV's
// own PresentationRenderer uses.
function slotAssets(presentation: Presentation | null | undefined): PresentationAsset[] {
  if (!presentation) return [];
  const byId = new Map(presentation.assets.map((a) => [a.id, a]));
  return presentation.layout.slots.map((slot) => byId.get(slot.assetId)).filter((a): a is PresentationAsset => Boolean(a));
}

// Splits `count` images into a near-square stack of row sizes with no
// empty cells (e.g. 5 -> [3, 2], not a 3x2 grid with one dead cell) —
// ported verbatim from the TV's own tv/src/render/ImageStage.ts so a
// collage reads identically here and on the real screen.
function collageRowSizes(count: number): number[] {
  const numRows = Math.min(count, Math.max(1, Math.round(Math.sqrt(count))));
  const baseSize = Math.floor(count / numRows);
  const extra = count % numRows;
  return Array.from({ length: numRows }, (_, row) => baseSize + (row < extra ? 1 : 0));
}

// Groups a composition's slot assets into display rows: a real near-square
// grid (matching the TV) for a 'collage' layout, otherwise the existing
// single-row behaviour (1-3 photos side by side).
function rowsFor(presentation: Presentation | null | undefined): PresentationAsset[][] {
  const assets = slotAssets(presentation);
  if (assets.length === 0) return [];
  if (presentation?.layout.type !== 'collage') return [assets];

  const rows: PresentationAsset[][] = [];
  let cursor = 0;
  for (const size of collageRowSizes(assets.length)) {
    rows.push(assets.slice(cursor, cursor + size));
    cursor += size;
  }
  return rows;
}

interface Selection {
  asset: PresentationAsset;
  fromNext: boolean;
}

// Resolves the single highlighted photo: an explicit pin (by asset id,
// which survives poll refreshes by identity rather than by index/position)
// if it still exists in `current` or `next`, else the first photo of
// whatever's currently displaying. Never more than one photo highlighted
// at once, and a pin pointing at a photo that has already played and
// rolled out of the queue quietly falls back to live instead of showing
// stale details for something no longer visible anywhere.
function resolveSelection(detail: TvDetail | null, selectedAssetId: string | null): Selection | null {
  if (selectedAssetId) {
    const inCurrent = slotAssets(detail?.current).find((a) => a.id === selectedAssetId);
    if (inCurrent) return { asset: inCurrent, fromNext: false };
    for (const presentation of detail?.next ?? []) {
      const inNext = slotAssets(presentation).find((a) => a.id === selectedAssetId);
      if (inNext) return { asset: inNext, fromNext: true };
    }
  }
  const currentFirst = slotAssets(detail?.current)[0];
  return currentFirst ? { asset: currentFirst, fromNext: false } : null;
}

export function TvDetailPane({ tv, albums, onConfigSaved }: Props) {
  const [detail, setDetail] = useState<TvDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = no explicit pin, always show whichever photo is currently live
  // (the default). A non-null value is a real pin by asset id — see
  // resolveSelection.
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
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
    setSelectedAssetId(null);
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

  const selection = resolveSelection(detail, selectedAssetId);
  const currentRows = rowsFor(detail?.current);

  // Location is fetched on demand per highlighted asset (never part of
  // Presentation/TvDetail — the TV must never receive it, PROJECT.md
  // §5.7/§13) and follows whichever single photo is selected.
  useEffect(() => {
    if (!selection) {
      setLocation(null);
      setLocationLoading(false);
      return;
    }
    let cancelled = false;
    setLocationLoading(true);
    api
      .getAssetLocation(selection.asset.id)
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
  }, [selection?.asset.id]);

  return (
    <div className="tv-detail-pane">
      <header className="tv-header">
        <h2>{tv.name ?? 'Unnamed TV'}</h2>
        <span className={`status-pill ${effectiveTv.online ? 'online' : 'offline'}`}>
          {effectiveTv.online ? 'Online' : 'Offline'}
        </span>
      </header>

      {error && <p className="form-error">{error}</p>}

      <section className="now-showing">
        <h3>Now Showing</h3>
        {currentRows.length > 0 && detail?.current ? (
          <div className="composition-frame" style={{ background: detail.current.background.colour }}>
            {currentRows.map((row, i) => (
              <div key={i} className="composition-row">
                {row.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={`photo-tile${selection?.asset.id === asset.id ? ' selected' : ''}`}
                    onClick={() => setSelectedAssetId(asset.id)}
                    title="Show this photo's details and location"
                  >
                    <img src={api.resolveAssetUrl(asset.url)} alt="" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">Nothing reported as displaying yet.</p>
        )}
      </section>

      {selection && (
        <section className="details-row">
          <div className="exif-panel">
            <p className="album">{selection.asset.metadata.album}</p>
            <p className="filename">{selection.asset.metadata.filename}</p>
            {exifLines(selection.asset.metadata).map((line) => (
              <p key={line} className="exif-line">
                {line}
              </p>
            ))}
            {selection.fromNext && <p className="hint">Coming up next — click the current photo to return to live.</p>}
          </div>
          <LocationMap
            latitude={location?.latitude ?? null}
            longitude={location?.longitude ?? null}
            label={locationLabel(location)}
            loading={locationLoading}
          />
        </section>
      )}

      <TransportControls tv={effectiveTv} />

      <section className="next-strip">
        <h3>Next</h3>
        <div className="thumbnail-row">
          {(detail?.next ?? []).map((item) => {
            const rows = rowsFor(item);
            if (rows.length === 0) return null;
            return (
              <div key={item.presentationId} className="thumbnail-group">
                {rows.map((row, i) => (
                  <div key={i} className="thumbnail-group-row">
                    {row.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className={`photo-tile${selection?.asset.id === asset.id ? ' selected' : ''}`}
                        onClick={() => setSelectedAssetId(asset.id)}
                        title="Show this photo's details and location"
                      >
                        <img src={api.resolveAssetUrl(asset.url)} alt="" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
          {(!detail || detail.next.length === 0) && <p className="hint">Queue is empty.</p>}
        </div>
      </section>

      <ConfigForm tv={tv} albums={albums} onSaved={handleConfigSaved} />
    </div>
  );
}
