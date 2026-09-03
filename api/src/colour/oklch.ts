// OKLCH/OKLab colour-space utilities (PROJECT.md §5.3: "prefer OKLCH/Lab
// over raw RGB arithmetic"). The conversion matrices are Björn Ottosson's
// published OKLab formulas (https://bottosson.github.io/posts/oklab/) —
// the same ones behind CSS Color 4's oklch()/oklab() — implemented
// faithfully here and round-trip tested, not derived from scratch.
export interface Oklab {
  l: number;
  a: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
} // each 0-255

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function normalizeHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

// Shortest angular distance between two hues, in [0, 180] degrees —
// naive subtraction is wrong here (e.g. 10deg and 350deg are 20deg apart,
// not 340deg).
export function hueDelta(a: number, b: number): number {
  const diff = Math.abs(normalizeHue(a) - normalizeHue(b));
  return Math.min(diff, 360 - diff);
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(clamp(c, 0, 1) * 255);
}

export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToRgb({ l, a, b }: Oklab): Rgb {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;

  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb) };
}

export function oklabToOklch({ l, a, b }: Oklab): Oklch {
  const c = Math.sqrt(a * a + b * b);
  // A near-zero chroma has an essentially meaningless hue angle (noise
  // dominates atan2) — pin it to 0 rather than propagate a random hue
  // for greys/blacks/whites.
  const h = c < 1e-6 ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
  return { l, c, h };
}

export function oklchToOklab({ l, c, h }: Oklch): Oklab {
  const rad = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

export function rgbToOklch(rgb: Rgb): Oklch {
  return oklabToOklch(rgbToOklab(rgb));
}

export function oklchToRgb(oklch: Oklch): Rgb {
  return oklabToRgb(oklchToOklab(oklch));
}

function toHex2(n: number): string {
  return clamp(n, 0, 255).toString(16).padStart(2, '0');
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

export function oklchToHex(oklch: Oklch): string {
  return rgbToHex(oklchToRgb(oklch));
}

// Perceptually-uniform average of several OKLCH colours — used to combine
// per-image dominant colours into one composition-level colour (§5.3
// treats "the image(s)" as plural: a 2/3-up composition gets one mat
// derived from all its photos, not just the first one). Averages in
// OKLab's Cartesian (l, a, b) space rather than OKLCH's polar (l, c, h):
// hue is an angle, so averaging it directly is wrong (10deg and 350deg
// should average to 0deg, not 180deg) — converting to Cartesian first
// sidesteps that.
export function combineOklch(colours: Oklch[]): Oklch {
  const labs = colours.map(oklchToOklab);
  const n = labs.length;
  const mean: Oklab = {
    l: labs.reduce((s, c) => s + c.l, 0) / n,
    a: labs.reduce((s, c) => s + c.a, 0) / n,
    b: labs.reduce((s, c) => s + c.b, 0) / n,
  };
  return oklabToOklch(mean);
}
