// Resolves a TV's configured MatMode into one final OKLCH mat colour for
// a composition (PROJECT.md §5.3, step 6: manual override modes).
// AUTOMATIC is the only mode that scores the whole candidate pool — every
// other mode picks (or fixes) a colour directly, deliberately bypassing
// scoring: "Warm" should always give you a warm neutral, not whatever the
// scorer happens to prefer for a given photo.
import type { MatMode } from '@prisma/client';
import type { Oklch } from './oklch.js';
import { generateMatCandidates, type MatCandidate, type MatCandidateKind } from './matCandidates.js';
import { selectBestMat } from './matScoring.js';

// Fixed neutrals (§5.3: "plus fixed neutrals — white, black, walnut/
// wood") — picked by eye in OKLCH, not derived from any real material
// sample; "wood" here means "a fixed warm walnut-ish brown," matching the
// spec's own phrasing.
const FIXED_WHITE: Oklch = { l: 0.98, c: 0.002, h: 90 };
const FIXED_BLACK: Oklch = { l: 0.1, c: 0.004, h: 90 };
const FIXED_WOOD: Oklch = { l: 0.42, c: 0.06, h: 55 };

function byKind(candidates: MatCandidate[], kind: MatCandidateKind): MatCandidate {
  return candidates.find((c) => c.kind === kind) ?? candidates[0];
}

export function resolveMatColour(matMode: MatMode, dominant: Oklch): Oklch {
  switch (matMode) {
    case 'AUTOMATIC':
      return selectBestMat(generateMatCandidates(dominant), dominant).oklch;
    case 'NEUTRAL':
      // A true hue-agnostic grey (barely any chroma) — distinct from the
      // warm/cool neutrals below, and from the photo's own hue.
      return { l: 0.85, c: 0.006, h: dominant.h };
    case 'WARM':
      return byKind(generateMatCandidates(dominant), 'warmNeutral').oklch;
    case 'COOL':
      return byKind(generateMatCandidates(dominant), 'coolNeutral').oklch;
    case 'DARK':
      return byKind(generateMatCandidates(dominant), 'darker').oklch;
    case 'LIGHT':
      return byKind(generateMatCandidates(dominant), 'lighter').oklch;
    case 'COMPLEMENTARY':
      return byKind(generateMatCandidates(dominant), 'complementary').oklch;
    case 'ANALOGOUS':
      return byKind(generateMatCandidates(dominant), 'analogous').oklch;
    case 'WHITE':
      return FIXED_WHITE;
    case 'BLACK':
      return FIXED_BLACK;
    case 'WOOD':
      return FIXED_WOOD;
    default: {
      const exhaustive: never = matMode;
      throw new Error(`Unhandled MatMode: ${String(exhaustive)}`);
    }
  }
}
