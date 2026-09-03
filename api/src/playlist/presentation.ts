import { randomUUID } from 'node:crypto';
import type { ImmichAsset } from '../immich/types.js';
import type { CompositionGroup, LayoutType, SlotPosition } from '../composition/group.js';

const CROSSFADE_SECONDS = 2;

export interface PresentationSlot {
  assetId: string;
  position: SlotPosition;
}

export interface PresentationAssetMetadata {
  album: string;
  filename: string;
  takenAt: string | null;
  camera: string | null;
  lens: string | null;
  exposureTime: string | null;
  fNumber: number | null;
  iso: number | null;
  focalLength: number | null;
}

export interface PresentationAsset {
  id: string;
  url: string;
  metadata: PresentationAssetMetadata;
}

export interface Presentation {
  presentationId: string;
  duration: number;
  layout: { type: LayoutType; slots: PresentationSlot[] };
  background: { type: 'mat'; colour: string };
  // Faux-3D framing (Phase 5, §5.4) — the TV renders these as a subtle
  // shadow under each photo and a faint inner-edge highlight. Always
  // 'subtle'/'inner' in v1; there's no spec'd reason yet to vary them.
  frame: { shadow: 'subtle'; bevel: 'inner' };
  transition: { type: 'crossfade'; duration: number };
  assets: PresentationAsset[];
}

function buildPresentationAsset(asset: ImmichAsset, albumName: string): PresentationAsset {
  const exif = asset.exifInfo;
  const camera = [exif?.make, exif?.model].filter(Boolean).join(' ') || null;

  return {
    id: asset.id,
    // Relative — the TV resolves this against the same API base it used
    // to fetch the playlist. Never a direct Immich URL (§6).
    url: `/api/v1/assets/${asset.id}/thumbnail?size=preview`,
    metadata: {
      album: albumName,
      filename: asset.originalFileName,
      takenAt: exif?.dateTimeOriginal ?? null,
      camera,
      lens: exif?.lensModel ?? null,
      exposureTime: exif?.exposureTime ?? null,
      fNumber: exif?.fNumber ?? null,
      iso: exif?.iso ?? null,
      focalLength: exif?.focalLength ?? null,
      // No GPS/location fields, deliberately: this metadata object is
      // stored on the QueueItem and served to the TV via /playlist, and
      // the TV must never receive location data at all (§5.7, §13),
      // unlike the rest of this metadata. The dashboard's location map
      // (Phase 6) fetches GPS separately and on-demand instead — see
      // routes/albums.ts's GET /assets/:id/location.
    },
  };
}

export function buildPresentation(
  group: CompositionGroup,
  albumName: string,
  durationSeconds: number,
  matColourHex: string,
): Presentation {
  return {
    presentationId: randomUUID(),
    duration: durationSeconds,
    layout: {
      type: group.layoutType,
      slots: group.slots.map((slot) => ({ assetId: slot.asset.id, position: slot.position })),
    },
    background: { type: 'mat', colour: matColourHex },
    frame: { shadow: 'subtle', bevel: 'inner' },
    transition: { type: 'crossfade', duration: CROSSFADE_SECONDS },
    assets: group.slots.map((slot) => buildPresentationAsset(slot.asset, albumName)),
  };
}
