// Composition/layout grouping (PROJECT.md §5.2, §5.4) — turns an ordered
// list of image assets into displayable groups: single landscape/square
// images alone, portraits grouped 1-3 up. Pure and deterministic: the same
// input array always produces the same groups in the same order. Ordering
// itself (album order vs. the seeded shuffle) is the caller's job
// (playlist/queue.ts) — this module never reorders its input.
import type { ImmichAsset } from '../immich/types.js';
import { aspectRatio, classifyOrientation } from './orientation.js';

export type LayoutType = 'single' | 'two-portrait' | 'three-portrait' | 'collage';
export type SlotPosition = 'full' | 'left' | 'center' | 'right' | 'grid';

// Only the three orientation-driven layouts have a fixed slot count/order —
// 'collage' is variable-length (up to `maxCollageImages`) and built
// separately by toCollageGroup, not looked up here.
const SLOT_POSITIONS: Record<'single' | 'two-portrait' | 'three-portrait', SlotPosition[]> = {
  single: ['full'],
  'two-portrait': ['left', 'right'],
  'three-portrait': ['left', 'center', 'right'],
};

export interface CompositionSlot {
  asset: ImmichAsset;
  position: SlotPosition;
}

export interface CompositionGroup {
  layoutType: LayoutType;
  slots: CompositionSlot[];
}

// How many portraits look good sharing one composition, based on how
// narrow this one is (PROJECT.md §5.2: "Two portrait photographs with
// compatible proportions can be displayed together... Three narrower
// portrait photographs can be displayed together"). A very narrow, tall
// portrait divides cleanly into a three-up layout; anything wider defaults
// to a pair. Never 1 — a lone portrait is never an acceptable composition
// (user-requested correction: it leaves the screen looking half-empty; see
// packPortraitRun/groupForComposition for how a genuinely unpaired
// portrait — nothing else in its run — gets merged with a neighbouring
// image instead of ever standing alone).
//
// Thresholds are calibrated against real photo ratios, not arbitrary
// round numbers — checked against a real Immich album in Phase 4 testing,
// which caught the first version of these being miscalibrated: standard
// phone-camera portraits (iPhone: 4032x3024 rotated -> displayed
// 3024x4032, ratio 0.75) are by far the most common real-world shape and
// must land in the "pairs" bucket, not "alone", or grouping never fires
// on real data. 2:3 (0.667, the classic DSLR/mirrorless portrait crop)
// also pairs; only genuinely narrow shapes (9:16 = 0.5625 and below) get
// three-up.
function preferredGroupSize(ratio: number): 2 | 3 {
  return ratio <= 0.6 ? 3 : 2;
}

function layoutTypeForSize(size: number): 'single' | 'two-portrait' | 'three-portrait' {
  if (size === 2) return 'two-portrait';
  if (size === 3) return 'three-portrait';
  return 'single';
}

function toGroup(assets: ImmichAsset[]): CompositionGroup {
  const layoutType = layoutTypeForSize(assets.length);
  const positions = SLOT_POSITIONS[layoutType];
  return { layoutType, slots: assets.map((asset, i) => ({ asset, position: positions[i] })) };
}

// A collage's slot count is user-configured (maxCollageImages), not one of
// the fixed 1/2/3 shapes above, and mixes any orientation — 'grid' is the
// only position value needed since neither the TV nor the dashboard
// interpret slot position for layout, only slot *order* (see
// tv/src/render/ImageStage.ts).
function toCollageGroup(assets: ImmichAsset[]): CompositionGroup {
  return { layoutType: 'collage', slots: assets.map((asset) => ({ asset, position: 'grid' })) };
}

// Packs one run of consecutive portrait-classified assets into groups of
// 2-3, never 1 (user-requested correction: a lone portrait must never be
// shown by itself). Greedy: each group's size is capped by how narrow its
// first image is, but never exceeds what's left in the run. Since
// preferredGroupSize never returns less than 2, a dangling remainder can
// only ever be exactly 1 image at the very end of the run — folded into
// the previous group (2->3) when there's room, or reflowed (3+1 -> 2+2)
// when the previous group is already full. Requires run.length >= 2 — a
// run of exactly 1 portrait is handled by groupForComposition before this
// is ever called, by pairing it with a neighbouring non-portrait image.
function packPortraitRun(run: ImmichAsset[]): CompositionGroup[] {
  const sizes: number[] = [];
  let i = 0;
  while (i < run.length) {
    const remaining = run.length - i;
    sizes.push(Math.min(preferredGroupSize(aspectRatio(run[i])), remaining));
    i += sizes[sizes.length - 1];
  }

  const last = sizes.length - 1;
  if (sizes[last] === 1) {
    if (sizes[last - 1] < 3) {
      sizes[last - 1] += 1;
      sizes.pop();
    } else {
      sizes[last - 1] -= 1;
      sizes[last] = 2;
    }
  }

  const groups: CompositionGroup[] = [];
  let offset = 0;
  for (const size of sizes) {
    groups.push(toGroup(run.slice(offset, offset + size)));
    offset += size;
  }
  return groups;
}

export interface CompositionOptions {
  // Cap on how many photos one collage group holds (any orientation).
  maxCollageImages?: number;
  // Every Nth *composition* (not source photo) is a collage instead of the
  // normal orientation-driven layout — counts already-built groups, so it
  // lines up with what a viewer actually perceives as "slides". 0/undefined
  // disables collages entirely, reproducing the pre-collage behaviour
  // exactly.
  collageFrequency?: number;
}

// Groups an ordered list of images into displayable compositions.
//
// Landscape and square images are shown alone, never auto-paired with
// each other (per §5.4, unless "genuinely complementary" — not
// implemented, so the simplest correct behaviour is to never pair them).
//
// Portraits are grouped in runs of up to 3, split by narrowness (see
// preferredGroupSize) and never left alone (user-requested correction — a
// lone portrait leaves the screen looking half-empty). A run of portraits
// is broken by the next non-portrait image; an image with missing/unusable
// dimensions falls back to "landscape" (see orientation.ts) rather than
// being force-fit into a group. When a run has only one portrait — nothing
// else nearby to pair it with — it's merged with whichever adjacent
// non-portrait image is available instead of ever standing alone: the next
// image is preferred (keeps chronological order forward), falling back to
// growing the immediately preceding group by one (up to the 3-up cap) if
// there's no next image. Only when genuinely nothing else exists to pair
// with (e.g. a single-image album, or the preceding group is already full
// with nothing after it) is a lone portrait unavoidable.
//
// Collage (opt-in via `options.collageFrequency`): every Nth composition,
// instead of the usual orientation-driven grouping, the next
// min(maxCollageImages, remaining) images — any orientation, taken in
// array order — become one 'collage' group. If fewer than 2 images remain
// when a collage turn comes up, falls through to normal single-image
// grouping instead of emitting a degenerate 1-photo "collage".
//
// Edge cases this naturally covers: a single-image album (one group);
// all-landscape or all-square albums (every group is size 1); all-portrait
// albums (packed 2-3 up, no remainder ever left alone); mixed-orientation
// albums (portrait runs interrupted by landscape/square singles, isolated
// single portraits merged into a neighbour); panoramic/very-wide images
// (classified landscape, shown alone); very small images (classification
// only depends on aspect ratio, not pixel count, so these behave like any
// other image of that shape); a tail shorter than 2 images landing on a
// collage turn (shown normally instead).
export function groupForComposition(images: ImmichAsset[], options: CompositionOptions = {}): CompositionGroup[] {
  const { maxCollageImages = 6, collageFrequency = 0 } = options;
  const groups: CompositionGroup[] = [];
  let i = 0;
  while (i < images.length) {
    if (collageFrequency > 0 && (groups.length + 1) % collageFrequency === 0) {
      const size = Math.min(maxCollageImages, images.length - i);
      if (size >= 2) {
        groups.push(toCollageGroup(images.slice(i, i + size)));
        i += size;
        continue;
      }
    }

    if (classifyOrientation(images[i]) !== 'portrait') {
      groups.push(toGroup([images[i]]));
      i += 1;
      continue;
    }

    let end = i + 1;
    while (end < images.length && classifyOrientation(images[end]) === 'portrait') end += 1;

    if (end - i === 1) {
      // A genuinely isolated portrait — no neighbouring portrait to pair
      // it with. Never shown alone: merge with the next image if one
      // exists, else grow the immediately preceding group by one (up to
      // the 3-up cap) if there's room.
      const isolated = images[i];
      if (end < images.length) {
        groups.push(toGroup([isolated, images[end]]));
        i = end + 1;
        continue;
      }
      const previous = groups[groups.length - 1];
      if (previous && previous.slots.length < 3) {
        groups.pop();
        groups.push(toGroup([...previous.slots.map((slot) => slot.asset), isolated]));
        i = end;
        continue;
      }
      // Nothing to pair with at all (e.g. a single-image album, or the
      // preceding group is already full with nothing after it) — showing
      // it alone is unavoidable.
      groups.push(toGroup([isolated]));
      i = end;
      continue;
    }

    groups.push(...packPortraitRun(images.slice(i, end)));
    i = end;
  }
  return groups;
}
