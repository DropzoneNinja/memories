// Mat candidate generation (PROJECT.md §5.3, steps 2-3): turns one
// composition's dominant colour into a handful of gallery-plausible mat
// options using real colour-theory relationships on the OKLCH wheel —
// deliberately not just "match the photo's colour."
import { clamp, normalizeHue, oklchToHex, type Oklch } from './oklch.js';

export type MatCandidateKind =
  | 'complementary'
  | 'analogous'
  | 'mutedComplementary'
  | 'darker'
  | 'lighter'
  | 'warmNeutral'
  | 'coolNeutral'
  | 'nearWhite'
  | 'nearBlack';

export interface MatCandidate {
  kind: MatCandidateKind;
  oklch: Oklch;
  hex: string;
}

// Fixed hue angles for the two "neutral" candidates — a warm amber-grey
// and a cool blue-grey — with just enough chroma to read as warm/cool
// rather than sterile, colour-blind grey.
const WARM_NEUTRAL_HUE = 75;
const COOL_NEUTRAL_HUE = 250;
const NEUTRAL_CHROMA = 0.015;

function makeCandidate(kind: MatCandidateKind, oklch: Oklch): MatCandidate {
  const clamped: Oklch = { l: clamp(oklch.l, 0, 1), c: Math.max(0, oklch.c), h: normalizeHue(oklch.h) };
  return { kind, oklch: clamped, hex: oklchToHex(clamped) };
}

// Always returns 8 candidates (within PROJECT.md's "5-8"). Every
// candidate is derived from `dominant` except the two fixed neutrals;
// which of near-white/near-black is offered depends on the photo's own
// lightness — a mat that lands close to the photo's own lightness
// wouldn't add any contrast, so this always offers the one that actually
// would (bright photo -> near-black option; dark photo -> near-white).
export function generateMatCandidates(dominant: Oklch): MatCandidate[] {
  const candidates: MatCandidate[] = [
    // Complementary: opposite hue, moderate chroma, nudged toward
    // whichever lightness direction creates more contrast with the photo.
    makeCandidate('complementary', {
      l: clamp(dominant.l + (dominant.l < 0.5 ? 0.15 : -0.1), 0.2, 0.9),
      c: clamp(dominant.c * 0.7, 0.04, 0.14),
      h: dominant.h + 180,
    }),
    // Analogous: a neighbouring hue, so it reads as related to the photo
    // rather than opposed to it.
    makeCandidate('analogous', {
      l: clamp(dominant.l + 0.1, 0.2, 0.9),
      c: clamp(dominant.c * 0.6, 0.03, 0.12),
      h: dominant.h + 30,
    }),
    // Muted complementary: same relationship as above, heavily
    // desaturated — a quieter, more restrained alternative.
    makeCandidate('mutedComplementary', {
      l: clamp(dominant.l + 0.05, 0.3, 0.85),
      c: clamp(dominant.c * 0.25, 0.01, 0.05),
      h: dominant.h + 180,
    }),
    // Darker variant: the photo's own hue, pushed toward a deep tone — a
    // "shadow box" feel. Floored at 0.18, not lower: OKLCH's lightness
    // scale compresses hard near black (checked against real output —
    // L=0.08 renders as functionally indistinguishable from pure black),
    // and "darker" is meant to read as a deep tinted tone distinct from
    // the flat BLACK override mode, not a second way to get black.
    makeCandidate('darker', {
      l: clamp(dominant.l - 0.35, 0.18, 0.4),
      c: clamp(dominant.c * 0.5, 0.03, 0.08),
      h: dominant.h,
    }),
    // Lighter variant: the same hue pushed toward a pale, airy tone.
    makeCandidate('lighter', {
      l: clamp(dominant.l + 0.35, 0.7, 0.95),
      c: clamp(dominant.c * 0.35, 0.01, 0.06),
      h: dominant.h,
    }),
    makeCandidate('warmNeutral', { l: 0.82, c: NEUTRAL_CHROMA, h: WARM_NEUTRAL_HUE }),
    makeCandidate('coolNeutral', { l: 0.82, c: NEUTRAL_CHROMA, h: COOL_NEUTRAL_HUE }),
  ];

  candidates.push(
    dominant.l > 0.55
      ? makeCandidate('nearBlack', { l: 0.12, c: 0.01, h: dominant.h })
      : makeCandidate('nearWhite', { l: 0.96, c: 0.01, h: dominant.h }),
  );

  return candidates;
}
