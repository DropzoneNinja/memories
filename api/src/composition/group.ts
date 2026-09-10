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
// to a pair. Never 1 — this only ever runs on a portrait *run* of 2+ (see
// packPortraitRun); a genuinely isolated portrait (no adjacent portrait to
// pair with) is shown alone instead of being sized here, since a portrait
// may only ever share a composition with another portrait — never a
// landscape/square (user-requested correction: mixing orientations in one
// composition looks inconsistent — see groupForComposition).
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
// 2-3, never 1. Greedy: each group's size is capped by how narrow its
// first image is, but never exceeds what's left in the run. Since
// preferredGroupSize never returns less than 2, a dangling remainder can
// only ever be exactly 1 image at the very end of the run — folded into
// the previous group (2->3) when there's room, or reflowed (3+1 -> 2+2)
// when the previous group is already full. Requires run.length >= 2 — a
// run of exactly 1 portrait is handled by groupForComposition before this
// is ever called: shown alone rather than passed here, since a portrait
// must never share a composition with a non-portrait neighbour.
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
// preferredGroupSize). A run of portraits is broken by the next
// non-portrait image; an image with missing/unusable dimensions falls
// back to "landscape" (see orientation.ts) rather than being force-fit
// into a group. A portrait may only ever share a composition with another
// portrait — never a landscape/square (user-requested correction: mixing
// orientations in a 2-up looks inconsistent) — so when a run has only one
// portrait, with no adjacent portrait to pair it with, this looks ahead
// past the intervening non-portraits for the next portrait anywhere later
// in the album and pulls it forward to pair with (user-requested: prefer a
// pair over showing the isolated one alone). Images skipped over this way
// are displayed later, in their own position, once the main scan reaches
// them — nothing is dropped, only reordered. Only when no portrait
// remains anywhere ahead is showing it alone unavoidable. This is a greedy
// nearest-match, not a globally optimal pairing: it can occasionally
// "steal" the first image of what would otherwise have been a natural
// same-run pair further along, leaving that pair's second image isolated
// in turn — an accepted tradeoff for keeping this simple and predictable.
//
// Collage (opt-in via `options.collageFrequency`): every Nth composition,
// instead of the usual orientation-driven grouping, the next
// min(maxCollageImages, remaining) images — any orientation, taken in
// array order — become one 'collage' group, skipping over any image
// already pulled forward into an earlier lookahead pairing (see above) so
// it's never shown twice. If fewer than 2 images remain when a collage
// turn comes up, falls through to normal single-image grouping instead of
// emitting a degenerate 1-photo "collage".
//
// Edge cases this naturally covers: a single-image album (one group);
// all-landscape or all-square albums (every group is size 1); all-portrait
// albums (packed 2-3 up, no remainder ever left alone); mixed-orientation
// albums (portrait runs interrupted by landscape/square singles, isolated
// single portraits paired via lookahead with the nearest later portrait,
// or shown alone if none remains); panoramic/very-wide images (classified
// landscape, shown alone); very small images (classification only depends
// on aspect ratio, not pixel count, so these behave like any other image
// of that shape); a tail shorter than 2 images landing on a collage turn
// (shown normally instead).
export function groupForComposition(images: ImmichAsset[], options: CompositionOptions = {}): CompositionGroup[] {
  const { maxCollageImages = 6, collageFrequency = 0 } = options;
  const groups: CompositionGroup[] = [];
  // Indices already displayed via an earlier isolated-portrait's lookahead
  // pairing (see below) — skipped wherever the main scan or the collage
  // gatherer would otherwise reach them again.
  const consumed = new Set<number>();

  // Nearest not-yet-used portrait at or after `from`, or null if none
  // remains. Always the closest match, never a farther "better" one — see
  // the tradeoff noted in this function's doc comment above.
  function findNextPortrait(from: number): number | null {
    for (let j = from; j < images.length; j++) {
      if (!consumed.has(j) && classifyOrientation(images[j]) === 'portrait') return j;
    }
    return null;
  }

  let i = 0;
  while (i < images.length) {
    if (consumed.has(i)) {
      i += 1;
      continue;
    }

    if (collageFrequency > 0 && (groups.length + 1) % collageFrequency === 0) {
      // Contiguous in intent, but any index already consumed by an
      // earlier lookahead pairing is skipped rather than re-included —
      // backfilling from further along so a collage still gets up to
      // maxCollageImages actual (unique) photos.
      const collected: ImmichAsset[] = [];
      let j = i;
      while (j < images.length && collected.length < maxCollageImages) {
        if (!consumed.has(j)) collected.push(images[j]);
        j += 1;
      }
      if (collected.length >= 2) {
        groups.push(toCollageGroup(collected));
        i = j;
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
      // it with. Rather than show it alone, look further ahead for the
      // next available portrait (wherever it is) and pull it forward.
      const partner = findNextPortrait(end);
      if (partner !== null) {
        consumed.add(partner);
        groups.push(toGroup([images[i], images[partner]]));
        i = end;
        continue;
      }
      // No portrait left anywhere ahead — showing it alone is unavoidable.
      groups.push(toGroup([images[i]]));
      i = end;
      continue;
    }

    groups.push(...packPortraitRun(images.slice(i, end)));
    i = end;
  }
  return groups;
}
