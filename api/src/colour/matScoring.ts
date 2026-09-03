// Mat scoring/auto-selection (PROJECT.md §5.3, steps 4-5: "score and
// auto-select the best candidate using contrast with the photograph,
// colour harmony, luminance, saturation, readability, and 'does it
// compete with the photograph'"). Only used by AUTOMATIC mode — the
// named override modes (colour/matMode.ts) bypass scoring entirely and
// pick a specific candidate kind directly.
import { clamp, hueDelta, type Oklch } from './oklch.js';
import type { MatCandidate } from './matCandidates.js';

export function scoreMatCandidate(candidate: MatCandidate, dominant: Oklch): number {
  const lightnessDelta = Math.abs(candidate.oklch.l - dominant.l);

  // Contrast/luminance/readability: reward a clear-but-not-extreme
  // lightness gap. Peaks around a 0.35 delta — enough for the mat to
  // read as its own surface next to the photograph, not so much it looks
  // like a harsh cutout.
  const contrastScore = clamp(1 - Math.abs(lightnessDelta - 0.35) / 0.65, 0, 1);

  // Harmony: every candidate is already built from a named colour-theory
  // relationship (matCandidates.ts), but complementary/analogous are the
  // two "textbook" relationships, so they get a small extra nod.
  const harmonyScore = candidate.kind === 'complementary' || candidate.kind === 'analogous' ? 1 : 0.6;

  // Saturation: avoid garish mats (§5.3 calls this out explicitly).
  // Candidates already keep chroma low; this penalises whatever tail
  // remains.
  const saturationScore = 1 - clamp(candidate.oklch.c / 0.18, 0, 1);

  // "Does it compete with / disappear into the photograph": a candidate
  // whose hue is close to the photo's *and* whose lightness is also
  // close would read as barely-there rather than framing anything.
  const closeInHue = hueDelta(candidate.oklch.h, dominant.h) < 20;
  const closeInLightness = lightnessDelta < 0.15;
  const distinctnessScore = closeInHue && closeInLightness ? 0 : 1;

  return contrastScore * 0.4 + harmonyScore * 0.2 + saturationScore * 0.2 + distinctnessScore * 0.2;
}

// Deterministic: same candidates + dominant colour always picks the same
// one (no randomness, no tie-breaking ambiguity — ties keep the earlier
// candidate in the array).
export function selectBestMat(candidates: MatCandidate[], dominant: Oklch): MatCandidate {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = scoreMatCandidate(candidate, dominant);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}
