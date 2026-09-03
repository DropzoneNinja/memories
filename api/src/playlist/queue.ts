import type { Configuration, QueueItem } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { getImmichClient } from '../immich/config.js';
import { buildPresentation } from './presentation.js';
import { groupForComposition } from '../composition/group.js';
import { getOrAnalyzeAssetColour, prismaColourStore } from '../colour/cache.js';
import { extractDominantColour } from '../colour/dominantColour.js';
import { combineOklch, oklchToHex } from '../colour/oklch.js';
import { resolveMatColour } from '../colour/matMode.js';

// Presentation fields are plain JSON-serializable data by construction
// (presentation.ts), but their named TS interfaces don't structurally
// satisfy Prisma's index-signature-based InputJsonValue — this just
// asserts that known-safe shape rather than widening the field types.
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// Tiny deterministic PRNG (mulberry32) seeded from a string, so shuffling
// the same TV+config version always yields the same order rather than a
// fresh random one on every regeneration.
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  let state = h >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Regenerate a TV's whole materialized queue from its current
// configuration — called whenever the config changes (PUT .../config).
// Fetches the album from Immich once and persists the result as
// QueueItems, rather than hitting Immich on every /playlist poll.
export async function regenerateQueue(tvId: string, config: Configuration): Promise<void> {
  const albumId = config.albumIds[0];
  if (!albumId) {
    await prisma.$transaction([
      prisma.queueItem.deleteMany({ where: { tvId } }),
      prisma.tv.update({ where: { id: tvId }, data: { lastServedPosition: 0 } }),
    ]);
    return;
  }

  const immich = getImmichClient();
  const [album, assets] = await Promise.all([
    immich.getAlbum(albumId),
    immich.listAlbumAssets(albumId),
  ]);

  // Albums can contain videos — filter to images only (video support is
  // explicitly out of scope for v1, PROJECT.md §14).
  const images = assets.filter((a) => a.type === 'IMAGE');
  const ordered =
    config.playbackMode === 'SHUFFLE' ? seededShuffle(images, `${tvId}:${config.version}`) : images;

  // Composition engine (PROJECT.md §5.2, Phase 4): groups the ordered
  // images into displayable compositions (single landscape, 2/3-up
  // portrait groups) before turning each group into a QueueItem — one row
  // per *composition*, not per image, so a 3-portrait group is one
  // QueueItem the TV displays for one `intervalSeconds` interval, not
  // three. Runs on `ordered` so grouping is deterministic for a given
  // shuffle/sequential order, per the same seed as the shuffle itself.
  const groups = groupForComposition(ordered);

  // Colour/mat engine (PROJECT.md §5.3, Phase 5): one mat colour per
  // composition, derived from all its images' dominant colours combined
  // (not just the first one). Per-image analysis is cached by Immich
  // asset id (colour/cache.ts) — an asset appearing in many TVs/albums/
  // regenerations over time is only ever analysed once. Runs group-by-group
  // in parallel; each group's own slot analyses also run in parallel.
  const rows = await Promise.all(
    groups.map(async (group, index) => {
      const colours = await Promise.all(
        group.slots.map((slot) =>
          getOrAnalyzeAssetColour(prismaColourStore, slot.asset.id, async () => {
            const { body } = await immich.fetchThumbnail(slot.asset.id, 'thumbnail');
            return extractDominantColour(Buffer.from(body));
          }),
        ),
      );
      const matColour = oklchToHex(resolveMatColour(config.matMode, combineOklch(colours)));
      const presentation = buildPresentation(group, album.albumName, config.intervalSeconds, matColour);
      return {
        tvId,
        position: index,
        presentationId: presentation.presentationId,
        layout: toJson(presentation.layout),
        background: toJson(presentation.background),
        frame: toJson(presentation.frame),
        transition: toJson(presentation.transition),
        assets: toJson(presentation.assets),
        durationSeconds: presentation.duration,
      };
    }),
  );

  await prisma.$transaction([
    prisma.queueItem.deleteMany({ where: { tvId } }),
    prisma.queueItem.createMany({ data: rows }),
    prisma.tv.update({ where: { id: tvId }, data: { lastServedPosition: 0 } }),
  ]);
}

// The wire shape both /playlist and the Phase 6 dashboard's "current" /
// "next" fields use — factored out so there's exactly one place that
// turns a stored QueueItem back into a Presentation.
export function queueItemToPresentation(item: QueueItem) {
  return {
    presentationId: item.presentationId,
    duration: item.durationSeconds,
    layout: item.layout,
    background: item.background,
    frame: item.frame,
    transition: item.transition,
    assets: item.assets,
  };
}

export interface PlaylistResult {
  configurationVersion: number;
  items: QueueItem[];
}

// Hands out the next `count` items after wherever this TV last left off,
// looping the materialized queue once exhausted (a simple stand-in for
// the real disconnected/repeat policies, which are Phase 7's job).
export async function getNextPlaylistItems(deviceId: string, count: number): Promise<PlaylistResult | null> {
  const tv = await prisma.tv.findUnique({ where: { deviceId } });
  if (!tv) return null;

  const [allItems, latestConfig] = await Promise.all([
    prisma.queueItem.findMany({ where: { tvId: tv.id }, orderBy: { position: 'asc' } }),
    prisma.configuration.findFirst({ where: { tvId: tv.id }, orderBy: { version: 'desc' } }),
  ]);

  if (allItems.length === 0) {
    return { configurationVersion: latestConfig?.version ?? 0, items: [] };
  }

  const n = Math.min(count, allItems.length);
  const items: QueueItem[] = [];
  let position = tv.lastServedPosition % allItems.length;
  for (let i = 0; i < n; i++) {
    items.push(allItems[position]);
    position = (position + 1) % allItems.length;
  }

  await prisma.tv.update({ where: { id: tv.id }, data: { lastServedPosition: position } });

  return { configurationVersion: latestConfig?.version ?? 0, items };
}

// For Memories Web's "coming next" strip (§4.2, Phase 6) — the `count`
// items after whatever the TV last reported *actually displaying*
// (`currentPresentationId`), looping the same way /playlist does. This is
// deliberately independent of `lastServedPosition` (the hand-out cursor
// for batched /playlist requests, which runs ahead of what's on screen)
// — read-only, never advances anything.
export async function getUpcomingPreview(
  tvId: string,
  currentPresentationId: string | null,
  count: number,
): Promise<QueueItem[]> {
  const allItems = await prisma.queueItem.findMany({ where: { tvId }, orderBy: { position: 'asc' } });
  if (allItems.length === 0) return [];

  const currentIndex = currentPresentationId
    ? allItems.findIndex((item) => item.presentationId === currentPresentationId)
    : -1;
  const startPosition = currentIndex === -1 ? 0 : (currentIndex + 1) % allItems.length;

  const n = Math.min(count, allItems.length);
  const items: QueueItem[] = [];
  let position = startPosition;
  for (let i = 0; i < n; i++) {
    items.push(allItems[position]);
    position = (position + 1) % allItems.length;
  }
  return items;
}
