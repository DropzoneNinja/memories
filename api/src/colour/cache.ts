// Colour-analysis cache (PROJECT.md §5.3: "cache colour-analysis results
// by asset ID/hash — never re-analyse the same image twice"). The
// caching *decision* (`getOrAnalyzeAssetColour`) is decoupled from both
// storage and analysis via injected functions, so it's unit-testable
// with a fake in-memory store — no real database or image needed to
// verify "only computes on a miss."
import { prisma } from '../db.js';
import type { Oklch } from './oklch.js';

export interface ColourStore {
  get(assetId: string): Promise<Oklch | null>;
  set(assetId: string, colour: Oklch): Promise<void>;
}

export const prismaColourStore: ColourStore = {
  async get(assetId) {
    const row = await prisma.assetColourAnalysis.findUnique({ where: { immichAssetId: assetId } });
    return row ? { l: row.lightness, c: row.chroma, h: row.hue } : null;
  },
  async set(assetId, colour) {
    await prisma.assetColourAnalysis.upsert({
      where: { immichAssetId: assetId },
      create: { immichAssetId: assetId, lightness: colour.l, chroma: colour.c, hue: colour.h },
      update: { lightness: colour.l, chroma: colour.c, hue: colour.h },
    });
  },
};

// Returns the cached colour for `assetId` if one exists; otherwise runs
// `compute` (the caller supplies fetch+decode+analyze together as one
// closure, since this module has no opinion on how either happens) and
// stores the result before returning it.
export async function getOrAnalyzeAssetColour(
  store: ColourStore,
  assetId: string,
  compute: () => Promise<Oklch>,
): Promise<Oklch> {
  const cached = await store.get(assetId);
  if (cached) return cached;

  const colour = await compute();
  await store.set(assetId, colour);
  return colour;
}
