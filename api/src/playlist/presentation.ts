import { randomUUID } from 'node:crypto';
import type { ImmichAsset } from '../immich/types.js';
import type { CompositionGroup, LayoutType, SlotPosition } from '../composition/group.js';
import type { MatTexture } from '../colour/matMode.js';

const CROSSFADE_SECONDS = 2;

// Fixed letterbox/pillarbox background colour for video (post-Phase-8
// addition, revised after real-device feedback) — there's no
// dominant-colour input to derive one from config.matMode's warm/cool/
// automatic modes (that would mean decoding video frames, well beyond v1),
// so video ignores matMode entirely. Unlike a photo, video gets NO mat
// margin/border and no faux-3D framing (a mat is a physical-print
// metaphor that doesn't apply to video, and reserving a border wastes
// screen space) — this colour only ever shows behind the video as plain
// letterbox/pillarbox bars where its aspect ratio doesn't match the
// screen's (tv/src/render/VideoStage.ts), same as any standard video
// player. Still never crops or stretches (§3/§5.2) — object-fit: contain
// scales the video to the largest size that fits the screen while
// preserving its original aspect ratio.
const VIDEO_BACKGROUND_COLOUR = '#0a0a0c';

// Fallback when Immich doesn't report (or we can't yet trust) a video's
// real length (immich/types.ts's ImmichAsset.duration) — advancing is
// event-driven (the TV's <video> `ended` event), so this is never the
// normal advance trigger. It's a watchdog ceiling instead: if a stalled
// Range fetch or corrupt stream never fires `ended`, the TV still moves on
// after this many seconds rather than freezing indefinitely (PROJECT.md
// §5.10/§9.4 — "never wedge, never fail hard"). Deliberately NOT
// config.intervalSeconds — that's a photo-dwell setting a user could
// reasonably set to 10s, which would kill a real video after 10 seconds.
export const VIDEO_WATCHDOG_CEILING_SECONDS = 30 * 60;

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
  // VIDEO presentations only — the streaming proxy URL (routes/tvs.ts),
  // separate from `url` (which stays the thumbnail proxy — Memories Web's
  // "Now Showing"/"Next" preview thumbnail; the TV itself doesn't display
  // it — an earlier version used it as the <video>'s poster frame, but the
  // poster-to-decoded-first-frame swap looked like a jarring flash on real
  // hardware, so the TV was changed to show the plain background colour
  // while the stream buffers instead, see VideoStage.ts). Keeping these as
  // two distinct fields means resolvePresentationUrls()
  // (tv/src/render/PresentationRenderer.ts), which only ever reads `.url`,
  // automatically never feeds a video stream into the Blob image cache —
  // no code change needed there at all.
  videoUrl?: string;
  metadata: PresentationAssetMetadata;
}

export interface Presentation {
  presentationId: string;
  duration: number;
  // Independent of `layout.type` on purpose — composition/group.ts owns
  // LayoutType and never runs for video, so tagging its output with a
  // 'video' value would blur that module's boundary for no benefit.
  kind: 'image' | 'video';
  // Only meaningful when kind === 'video': true replays this presentation
  // indefinitely (the TV never auto-advances); false plays it once, then
  // advances on the video's `ended` event. Always false for images.
  loop: boolean;
  // For video, always one slot referencing the video's own asset — not
  // just a formality: Memories Web's TvDetailPane resolves its "Now
  // Showing"/"Next" preview thumbnail through these same slots (see
  // slotAssets() there), and PresentationRenderer's
  // resolvePresentationUrls() (tv/src/render/PresentationRenderer.ts)
  // walks them to prefetch/cache PresentationAsset.url like any other
  // thumbnail — the TV itself no longer displays that image (see
  // PresentationAsset.videoUrl's comment), but the dashboard still does.
  // `type` is always 'single' for video — composition grouping
  // (composition/group.ts) never runs for it.
  layout: { type: LayoutType; slots: PresentationSlot[] };
  // `texture` (RAW/matt-example-3.png, added alongside `colour`) names a
  // bundled material asset — 'wood' | 'cork' | 'cotton' | null — that both
  // renderers layer over the flat `colour` for a real material look
  // instead of a perfectly flat mat. Never a URL: the TV and dashboard
  // each ship their own copy of these static images (tv/public/mats/,
  // web/public/mats/), so this never depends on network reachability.
  background: { type: 'mat'; colour: string; texture: MatTexture | null };
  // Faux-3D framing (Phase 5, §5.4) — the TV renders these as a subtle
  // shadow under each photo and a faint inner-edge highlight. Always
  // 'subtle'/'inner' for a photo; there's no spec'd reason yet to vary
  // those. Always 'none'/'none' for video (post-Phase-8 addition) — a
  // mat/frame is a physical-print metaphor that doesn't apply to video,
  // which the TV renders full-bleed with no faux-3D treatment at all.
  frame: { shadow: 'subtle' | 'none'; bevel: 'inner' | 'none' };
  transition: { type: 'crossfade'; duration: number };
  assets: PresentationAsset[];
}

function buildAssetMetadata(asset: ImmichAsset, albumName: string): PresentationAssetMetadata {
  const exif = asset.exifInfo;
  const camera = [exif?.make, exif?.model].filter(Boolean).join(' ') || null;

  return {
    album: albumName,
    filename: asset.originalFileName,
    takenAt: exif?.dateTimeOriginal ?? null,
    camera,
    lens: exif?.lensModel ?? null,
    exposureTime: exif?.exposureTime ?? null,
    fNumber: exif?.fNumber ?? null,
    iso: exif?.iso ?? null,
    focalLength: exif?.focalLength ?? null,
    // No GPS/location fields, deliberately: this metadata object is stored
    // on the QueueItem and served to the TV via /playlist, and the TV must
    // never receive location data at all (§5.7, §13), unlike the rest of
    // this metadata. The dashboard's location map (Phase 6) fetches GPS
    // separately and on-demand instead — see routes/tvs.ts's GET
    // /tvs/:tvId/assets/:assetId/location.
  };
}

function buildPresentationAsset(asset: ImmichAsset, albumName: string, tvId: string): PresentationAsset {
  return {
    id: asset.id,
    // Relative — the TV resolves this against the same API base it used
    // to fetch the playlist. Never a direct Immich URL (§6). Scoped by
    // tvId (not a flat /assets/:id route) because each TV's queue can now
    // be backed by a different household member's Immich account (Phase
    // 8) — the thumbnail proxy needs the TV to know which credentials to
    // use, and the TV itself has no login/user concept to supply that.
    url: `/api/v1/tvs/${tvId}/assets/${asset.id}/thumbnail?size=preview`,
    metadata: buildAssetMetadata(asset, albumName),
  };
}

export function buildPresentation(
  group: CompositionGroup,
  albumName: string,
  durationSeconds: number,
  matColourHex: string,
  tvId: string,
  matTexture: MatTexture | null,
): Presentation {
  return {
    presentationId: randomUUID(),
    duration: durationSeconds,
    kind: 'image',
    loop: false,
    layout: {
      type: group.layoutType,
      slots: group.slots.map((slot) => ({ assetId: slot.asset.id, position: slot.position })),
    },
    background: { type: 'mat', colour: matColourHex, texture: matTexture },
    frame: { shadow: 'subtle', bevel: 'inner' },
    transition: { type: 'crossfade', duration: CROSSFADE_SECONDS },
    assets: group.slots.map((slot) => buildPresentationAsset(slot.asset, albumName, tvId)),
  };
}

// Parses Immich's "H:MM:SS.ssssss" video duration string into whole
// seconds. Returns null on anything unrecognized so callers can fall back
// to VIDEO_WATCHDOG_CEILING_SECONDS rather than throwing — this format is
// unverified against the real running instance (see ImmichClient's
// fetchVideoStream comment), so tolerating a surprise shape here matters
// more than being strict about it.
export function parseImmichDurationSeconds(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const match = /^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(duration.trim());
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function buildVideoPresentationAsset(asset: ImmichAsset, albumName: string, tvId: string): PresentationAsset {
  return {
    id: asset.id,
    // Same thumbnail proxy as the image path — Memories Web's preview
    // thumbnail (see `videoUrl`'s comment above for why the TV itself
    // doesn't display this as a <video poster> anymore).
    url: `/api/v1/tvs/${tvId}/assets/${asset.id}/thumbnail?size=preview`,
    videoUrl: `/api/v1/tvs/${tvId}/assets/${asset.id}/video`,
    metadata: buildAssetMetadata(asset, albumName),
  };
}

// Video's counterpart to buildPresentation() — deliberately not routed
// through groupForComposition() or the colour/mat engine (queue.ts's
// buildVideoQueueRows skips both entirely): a video is always a single
// full-screen item, never grouped with others, and has no per-asset
// dominant colour to derive a mat from. `frame` is always 'none'/'none'
// for video (unlike a photo's 'subtle'/'inner') — there's no mat for a
// faux-3D shadow/bevel to sit on top of.
export function buildVideoPresentation(asset: ImmichAsset, albumName: string, tvId: string, loop: boolean): Presentation {
  const duration = parseImmichDurationSeconds(asset.duration) ?? VIDEO_WATCHDOG_CEILING_SECONDS;
  return {
    presentationId: randomUUID(),
    duration,
    kind: 'video',
    loop,
    layout: { type: 'single', slots: [{ assetId: asset.id, position: 'full' }] },
    background: { type: 'mat', colour: VIDEO_BACKGROUND_COLOUR, texture: null },
    frame: { shadow: 'none', bevel: 'none' },
    transition: { type: 'crossfade', duration: CROSSFADE_SECONDS },
    assets: [buildVideoPresentationAsset(asset, albumName, tvId)],
  };
}
