// Shared between ImageStage and VideoStage — both render single- or
// multi-slot content matted the same way (§5.4's faux-3D framing, §5.3's
// mat colour/texture). Extracted rather than inherited: the two stages
// have fundamentally different element lifecycles (ImageStage rebuilds
// fresh <img> elements into crossfading layers on every show(); VideoStage
// keeps one persistent <video> alive across pause/resume), so composition
// over a shared style module fits better than a base class.

export interface FrameStyle {
  shadow: string; // 'subtle' | 'none'
  bevel: string; // 'inner' | 'recessed' | 'none'
}

export const NO_FRAME: FrameStyle = { shadow: 'none', bevel: 'none' };

// Uniform mat margin reserved around every photo/video, on every side.
// `vmin` resolves against the viewport, not each slot's own (possibly
// narrower) box, so every composition gets the same real-pixel margin —
// see ImageStage's original comment (git history) for the height-
// constrained-photo bug this specifically fixed.
export const MAT_MARGIN = '2.5vmin';

export function boxShadowFor(frame: FrameStyle): string {
  const layers: string[] = [];

  if (frame.bevel === 'recessed') {
    // Inverted from the 'inner' look below: the mat's cut edge overlaps
    // the photo and casts its shadow inward, instead of the photo casting
    // a shadow outward onto the mat — reads as a print sitting behind a
    // cut-out mat window rather than raised above a flat one
    // (RAW/matt-example-1.png/-2.png).
    //
    // IMPORTANT: this string is applied to a dedicated overlay element
    // positioned over the photo (ImageStage.ts's buildRow), never to the
    // <img> itself. An inset box-shadow on an <img> paints underneath the
    // image's own decoded bitmap (a replaced element's content always
    // paints after that same element's background/box-shadow), so it
    // ends up almost entirely hidden behind the photo — confirmed against
    // a real photo of the actual TV screen, only a sub-pixel sliver was
    // visible at one edge. The overlay is a separate, later-painted
    // sibling with no bitmap content of its own, so both the inset (dark,
    // "inside the window") and outer (bright, "in the mat margin") layers
    // below actually render where intended.
    if (frame.shadow !== 'none') {
      layers.push(
        // Bright bevel-reveal ring just outside the window opening, in
        // the mat margin — real bevel-cut matboard shows its (usually
        // white/cream) paper core at the cut, catching light, regardless
        // of the mat's own surface colour.
        '0 0 0 2px rgba(255,255,255,0.6)',
        // Crisp dark line right at the cut edge...
        'inset 0 0 0 2px rgba(0,0,0,0.65)',
        // ...a stronger shadow hugging just inside it...
        'inset 0 0 10px 6px rgba(0,0,0,0.55)',
        // ...and a broad, soft falloff reaching well into the photo, for
        // real depth rather than a thin dark line.
        'inset 0 0 32px 14px rgba(0,0,0,0.3)',
      );
    }
    return layers.join(', ');
  }

  if (frame.shadow !== 'none') {
    // The photo lifted slightly off the mat, plus a broader, softer cast
    // shadow that actually darkens the mat surface around it, plus a
    // hairline edge that grounds it. All three layered, all very soft —
    // never a hard-edged web-card shadow.
    layers.push(
      '0 3px 14px rgba(0,0,0,0.35)',
      '0 14px 54px rgba(0,0,0,0.3)',
      '0 0 0 1px rgba(0,0,0,0.08)',
    );
  }
  if (frame.bevel !== 'none') {
    // A full-perimeter hairline highlight — `inset 0 0 0 1px` (zero
    // offset, 1px spread) draws that evenly on all four edges.
    layers.push('inset 0 0 0 1px rgba(255,255,255,0.07)');
  }
  return layers.join(', ');
}

// Parses a #rrggbb (or #rgb) hex colour into an `rgba(...)` string at the
// given alpha — used to tint a material texture image toward the mat's
// computed colour rather than showing the raw photographed swatch tone
// directly.
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Applies the flat-colour-or-material-texture mat background (§5.3/§5.4)
// to any full-bleed container element — shared by ImageStage's root and
// VideoStage's root so both render an identical mat surface.
export function applyMatBackground(el: HTMLElement, color: string, textureUrl: string | null = null): void {
  // A very faint vignette over the flat mat colour — reads as a physical
  // surface catching light unevenly, not as a visible design element.
  const vignette = 'radial-gradient(ellipse at center, rgba(255,255,255,0.025), rgba(0,0,0,0.06))';

  if (textureUrl) {
    const wash = hexToRgba(color, 0.55);
    el.style.backgroundImage = `linear-gradient(${wash}, ${wash}), ${vignette}, url("${textureUrl}")`;
    el.style.backgroundSize = 'auto, auto, cover';
    el.style.backgroundPosition = 'center, center, center';
    el.style.backgroundColor = color;
  } else {
    el.style.backgroundImage = vignette;
    el.style.backgroundColor = color;
  }
}
