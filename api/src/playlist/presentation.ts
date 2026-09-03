import { randomUUID } from 'node:crypto';
import type { ImmichAsset } from '../immich/types.js';
import type { CompositionGroup, LayoutType, SlotPosition } from '../composition/group.js';

// Colour-theory mat generation is Phase 5 — this is still the simplest
// valid mat/frame/transition (PROJECT.md §5.1), just now driven by a real
// multi-slot composition (Phase 4) instead of one image at a time.
const PLACEHOLDER_MAT_COLOUR = '#141414';
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
  frame: { shadow: 'none'; bevel: 'none' };
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
      // No GPS/location fields — PROJECT.md §12 defaults that to
      // never-surfaced, anywhere.
    },
  };
}

export function buildPresentation(
  group: CompositionGroup,
  albumName: string,
  durationSeconds: number,
): Presentation {
  return {
    presentationId: randomUUID(),
    duration: durationSeconds,
    layout: {
      type: group.layoutType,
      slots: group.slots.map((slot) => ({ assetId: slot.asset.id, position: slot.position })),
    },
    background: { type: 'mat', colour: PLACEHOLDER_MAT_COLOUR },
    frame: { shadow: 'none', bevel: 'none' },
    transition: { type: 'crossfade', duration: CROSSFADE_SECONDS },
    assets: group.slots.map((slot) => buildPresentationAsset(slot.asset, albumName)),
  };
}
