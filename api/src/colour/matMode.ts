// Resolves a TV's configured MatMode into one final OKLCH mat colour for
// a composition (PROJECT.md §5.3, step 6: manual override modes).
// AUTOMATIC is the only mode that scores the whole candidate pool — every
// other mode picks (or fixes) a colour directly, deliberately bypassing
// scoring: "Warm" should always give you a warm neutral, not whatever the
// scorer happens to prefer for a given photo.
import type { MatMode } from '@prisma/client';
import { clamp, normalizeHue, type Oklch } from './oklch.js';
import { generateMatCandidates, type MatCandidate, type MatCandidateKind } from './matCandidates.js';
import { selectBestMat } from './matScoring.js';

// Fixed neutrals (§5.3: "plus fixed neutrals — white, black, walnut/
// wood") — picked by eye in OKLCH, not derived from any real material
// sample; "wood" here means "a fixed warm walnut-ish brown," matching the
// spec's own phrasing. WOOD/CORK/COTTON also carry a real texture image
// (see resolveMatTexture below) layered over this colour on both
// renderers — the colour stays the flat base/fallback tone, roughly
// matched to its texture so a slow-loading image never looks jarring
// against it.
// HIGH_CONTRAST (below) isn't fixed — it's still derived from the photo's
// own dominant colour — but its lightness/chroma targets are picked by eye
// the same way these fixed neutrals are: pushed to whichever extreme
// contrasts most with the photo, at a chroma well past every other mode's
// range (they top out around 0.14) so it reads as genuinely vivid rather
// than a more-saturated DARK/LIGHT.
const HIGH_CONTRAST_DARK_L = 0.15;
const HIGH_CONTRAST_LIGHT_L = 0.92;
const HIGH_CONTRAST_CHROMA_BOOST = 2.2;
const HIGH_CONTRAST_MIN_CHROMA = 0.16;
const HIGH_CONTRAST_MAX_CHROMA = 0.28;

const FIXED_WHITE: Oklch = { l: 0.98, c: 0.002, h: 90 };
const FIXED_BLACK: Oklch = { l: 0.1, c: 0.004, h: 90 };
const FIXED_WOOD: Oklch = { l: 0.42, c: 0.06, h: 55 };
const FIXED_CORK: Oklch = { l: 0.5, c: 0.09, h: 45 };
const FIXED_COTTON: Oklch = { l: 0.93, c: 0.008, h: 80 };

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
    case 'HIGH_CONTRAST':
      return {
        l: dominant.l > 0.5 ? HIGH_CONTRAST_DARK_L : HIGH_CONTRAST_LIGHT_L,
        c: clamp(dominant.c * HIGH_CONTRAST_CHROMA_BOOST, HIGH_CONTRAST_MIN_CHROMA, HIGH_CONTRAST_MAX_CHROMA),
        h: normalizeHue(dominant.h),
      };
    case 'WHITE':
      return FIXED_WHITE;
    case 'BLACK':
      return FIXED_BLACK;
    case 'WOOD':
      return FIXED_WOOD;
    case 'CORK':
      return FIXED_CORK;
    case 'COTTON':
      return FIXED_COTTON;
    default: {
      const exhaustive: never = matMode;
      throw new Error(`Unhandled MatMode: ${String(exhaustive)}`);
    }
  }
}

export type MatTexture = 'wood' | 'cork' | 'cotton';

// Which bundled material texture (if any) a mode renders over its flat
// colour — a static app asset (tv/public/mats/, web/public/mats/), never
// served by the API itself, so this is just the lookup key, not a URL.
export function resolveMatTexture(matMode: MatMode): MatTexture | null {
  switch (matMode) {
    case 'WOOD':
      return 'wood';
    case 'CORK':
      return 'cork';
    case 'COTTON':
      return 'cotton';
    default:
      return null;
  }
}
