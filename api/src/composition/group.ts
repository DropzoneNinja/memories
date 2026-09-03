// Composition/layout grouping (PROJECT.md §5.2, §5.4) — turns an ordered
// list of image assets into displayable groups: single landscape/square
// images alone, portraits grouped 1-3 up. Pure and deterministic: the same
// input array always produces the same groups in the same order. Ordering
// itself (album order vs. the seeded shuffle) is the caller's job
// (playlist/queue.ts) — this module never reorders its input.
import type { ImmichAsset } from '../immich/types.js';
import { aspectRatio, classifyOrientation } from './orientation.js';

export type LayoutType = 'single' | 'two-portrait' | 'three-portrait';
export type SlotPosition = 'full' | 'left' | 'center' | 'right';

const SLOT_POSITIONS: Record<LayoutType, SlotPosition[]> = {
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
// portrait photographs can be displayed together"). A near-square
// portrait given only a third or half of the screen width would leave
// awkward mat space either side, so it's better shown alone; a very
// narrow, tall portrait divides cleanly into a three-up layout.
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
function preferredGroupSize(ratio: number): 1 | 2 | 3 {
  if (ratio <= 0.6) return 3;
  if (ratio <= 0.85) return 2;
  return 1;
}

function layoutTypeForSize(size: number): LayoutType {
  if (size === 2) return 'two-portrait';
  if (size === 3) return 'three-portrait';
  return 'single';
}

function toGroup(assets: ImmichAsset[]): CompositionGroup {
  const layoutType = layoutTypeForSize(assets.length);
  const positions = SLOT_POSITIONS[layoutType];
  return { layoutType, slots: assets.map((asset, i) => ({ asset, position: positions[i] })) };
}

// Packs one run of consecutive portrait-classified assets into groups of
// 1-3 (PROJECT.md §5.4: "remainder groups of 1/2/3 portraits at the end of
// a pass"). Greedy: each group's size is capped by how narrow its first
// image is, but never exceeds what's left in the run — so a run that
// doesn't divide evenly always ends in a valid smaller group instead of
// forcing a mismatched image in just to complete a layout.
function packPortraitRun(run: ImmichAsset[]): CompositionGroup[] {
  const groups: CompositionGroup[] = [];
  let i = 0;
  while (i < run.length) {
    const remaining = run.length - i;
    const size = Math.min(preferredGroupSize(aspectRatio(run[i])), remaining);
    groups.push(toGroup(run.slice(i, i + size)));
    i += size;
  }
  return groups;
}

// Groups an ordered list of images into displayable compositions.
//
// Landscape and square images are always shown alone: never cropped, and
// per §5.4 two landscapes must never be auto-paired unless "genuinely
// complementary" — this engine doesn't implement that exception, so the
// simplest correct behaviour is to never pair them at all, which also
// keeps the layout model to exactly the three types PROJECT.md names
// (single, two-portrait, three-portrait).
//
// Portraits are grouped in runs of up to 3, split by narrowness (see
// preferredGroupSize). A run of portraits is broken by the next
// non-portrait image; an image with missing/unusable dimensions falls
// back to "landscape" (see orientation.ts) rather than being force-fit
// into a group.
//
// Edge cases this naturally covers: a single-image album (one group);
// all-landscape or all-square albums (every group is size 1); all-portrait
// albums (packed with a remainder of 1 or 2 at the end); mixed-orientation
// albums (portrait runs interrupted by landscape/square singles);
// panoramic/very-wide images (classified landscape, shown alone); very
// small images (classification only depends on aspect ratio, not pixel
// count, so these behave like any other image of that shape).
export function groupForComposition(images: ImmichAsset[]): CompositionGroup[] {
  const groups: CompositionGroup[] = [];
  let i = 0;
  while (i < images.length) {
    if (classifyOrientation(images[i]) !== 'portrait') {
      groups.push(toGroup([images[i]]));
      i += 1;
      continue;
    }

    let end = i + 1;
    while (end < images.length && classifyOrientation(images[end]) === 'portrait') end += 1;
    groups.push(...packPortraitRun(images.slice(i, end)));
    i = end;
  }
  return groups;
}
