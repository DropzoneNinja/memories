// Shared between ImageStage and VideoStage — both render single- or
// multi-slot content matted the same way (§5.4's faux-3D framing, §5.3's
// mat colour/texture). Extracted rather than inherited: the two stages
// have fundamentally different element lifecycles (ImageStage rebuilds
// fresh <img> elements into crossfading layers on every show(); VideoStage
// keeps one persistent <video> alive across pause/resume), so composition
// over a shared style module fits better than a base class.

export interface FrameStyle {
  shadow: string; // 'subtle' | 'none'
  bevel: string; // 'inner' | 'none'
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
