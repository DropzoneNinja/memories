// Dominant/representative colour extraction (PROJECT.md §5.3, step 1).
// Works on raw image bytes (an Immich thumbnail — already small, so this
// never touches a full-resolution original per §9.8) rather than a URL,
// so it's independent of how the caller fetched them.
import sharp from 'sharp';
import type { Oklab, Oklch } from './oklch.js';
import { oklabToOklch, rgbToOklab } from './oklch.js';

// 32x32 = 1024 pixels — plenty to estimate a dominant colour from, cheap
// to decode and cluster.
const SAMPLE_SIZE = 32;
const CLUSTERS = 5;
const ITERATIONS = 8;

// A neutral, inoffensive fallback for when an asset can't be decoded
// (corrupt file, a format Immich let through that sharp doesn't support)
// — one bad image must never break queue regeneration for the rest of
// the album (the same "never fail hard" principle as §5.10's
// disconnected-behaviour policies).
export const FALLBACK_COLOUR: Oklch = { l: 0.6, c: 0, h: 0 };

function distSq(a: Oklab, b: Oklab): number {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dl * dl + da * da + db * db;
}

// Deterministic k-means over OKLab points: initial centroids are evenly
// spaced samples of the input (never random), and it always runs the
// same fixed number of iterations — same pixels in, same clusters out,
// every time. That determinism is what makes the colour-analysis cache
// (colour/cache.ts) meaningful, and echoes the composition engine's own
// determinism requirement (§5.4) extended to colour. Exported on its own
// so the clustering logic is unit-testable against synthetic points,
// without decoding a real image.
export function kMeansOklab(
  points: Oklab[],
  k: number,
  iterations = ITERATIONS,
): Array<{ centroid: Oklab; count: number }> {
  if (points.length === 0) return [];
  const effectiveK = Math.min(k, points.length);
  let centroids: Oklab[] = Array.from(
    { length: effectiveK },
    (_, i) => points[Math.floor((i * points.length) / effectiveK)],
  );

  let assignments = new Array(points.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    assignments = points.map((p) => {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const d = distSq(p, centroids[i]);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    });

    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, count: 0 }));
    for (let i = 0; i < points.length; i++) {
      const sum = sums[assignments[i]];
      sum.l += points[i].l;
      sum.a += points[i].a;
      sum.b += points[i].b;
      sum.count += 1;
    }
    // A centroid with no points assigned this round keeps its previous
    // position rather than collapsing to (0,0,0).
    centroids = sums.map((sum, i) =>
      sum.count > 0 ? { l: sum.l / sum.count, a: sum.a / sum.count, b: sum.b / sum.count } : centroids[i],
    );
  }

  const counts = new Array(centroids.length).fill(0);
  for (const a of assignments) counts[a] += 1;
  return centroids.map((centroid, i) => ({ centroid, count: counts[i] }));
}

// Downsamples hard and clusters in OKLab (perceptually meaningful, not
// raw RGB — §5.3), returning the *largest* cluster's centroid: literally
// the most-represented colour region in the photo, not a flat average
// (which tends toward muddy grey on colourful images).
export async function extractDominantColour(imageBytes: Buffer): Promise<Oklch> {
  try {
    const { data, info } = await sharp(imageBytes)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const points: Oklab[] = [];
    for (let i = 0; i + 2 < data.length; i += info.channels) {
      points.push(rgbToOklab({ r: data[i], g: data[i + 1], b: data[i + 2] }));
    }

    const clusters = kMeansOklab(points, CLUSTERS);
    if (clusters.length === 0) return FALLBACK_COLOUR;

    const dominant = clusters.reduce((best, c) => (c.count > best.count ? c : best), clusters[0]);
    return oklabToOklch(dominant.centroid);
  } catch (err) {
    console.error('Colour analysis failed, using fallback colour', err);
    return FALLBACK_COLOUR;
  }
}
