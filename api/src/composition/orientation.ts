// Aspect-ratio/orientation classification for the composition engine
// (PROJECT.md §5.2). Independent, unit-testable module — no Immich network
// calls, pure functions over the asset shape.
import type { ImmichAsset } from '../immich/types.js';

export type Orientation = 'landscape' | 'portrait' | 'square';

export interface Dimensions {
  width: number;
  height: number;
}

// Ratios within [1 - tolerance, 1 + tolerance] count as "square" rather
// than landscape or portrait.
const SQUARE_TOLERANCE = 0.05;

// EXIF orientation tags 5-8 are 90-degree rotations, so the *displayed*
// dimensions are exifImageWidth/Height swapped, not as-is (see
// immich/types.ts — Immich's exifImage{Width,Height} reflect the raw
// sensor data before rotation is applied).
function isRotated90(orientation: string | null | undefined): boolean {
  const n = orientation ? Number(orientation) : 1;
  return n >= 5 && n <= 8;
}

// Returns null when Immich hasn't given us usable pixel dimensions (no
// EXIF, a corrupt/unsupported file, a "very small" or otherwise degenerate
// image with zero/negative reported size). Callers fall back to treating
// the asset as landscape (see classifyOrientation) — the safer default,
// since it's always shown alone rather than force-fit into a portrait
// slot it might not actually suit.
export function getDisplayDimensions(asset: ImmichAsset): Dimensions | null {
  const exif = asset.exifInfo;
  const width = exif?.exifImageWidth ?? null;
  const height = exif?.exifImageHeight ?? null;
  if (!width || !height || width <= 0 || height <= 0) return null;

  return isRotated90(exif?.orientation) ? { width: height, height: width } : { width, height };
}

// Square images (e.g. Instagram-style crops) are bucketed with landscape
// for grouping purposes: like a landscape, a square photo isn't "tall"
// enough to want a narrow portrait slot, and reads better shown alone with
// its own mat than squeezed beside a genuinely tall portrait (§5.2's
// portrait-grouping edge cases call out "square" images explicitly as a
// case to handle, without prescribing which bucket — this is the
// documented choice).
export function classifyOrientation(asset: ImmichAsset): Orientation {
  const dims = getDisplayDimensions(asset);
  if (!dims) return 'landscape';

  const ratio = dims.width / dims.height;
  if (ratio > 1 + SQUARE_TOLERANCE) return 'landscape';
  if (ratio < 1 - SQUARE_TOLERANCE) return 'portrait';
  return 'square';
}

// width / height. Used to judge how narrow a portrait is (see
// composition/group.ts's preferredGroupSize) — irrelevant for
// landscape/square assets, which are always shown alone. Falls back to a
// plain 16:9 guess when dimensions are unavailable, consistent with
// classifyOrientation's landscape fallback.
export function aspectRatio(asset: ImmichAsset): number {
  const dims = getDisplayDimensions(asset);
  if (!dims) return 16 / 9;
  return dims.width / dims.height;
}
