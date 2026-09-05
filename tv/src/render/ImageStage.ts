// Full-screen composition renderer: contain-fit (never crop, never
// stretch — PROJECT.md §5.2), centered on a mat/background colour, with a
// simple crossfade between compositions (§5.5). Renders 1-3 images side by
// side per the server's layout slots (Phase 4) — each slot gets an equal
// share of the width and contain-fits its own image independently, so a
// two/three-portrait composition never crops or stretches any one photo
// to match the others. A 'collage' layout (composition addendum) renders
// as a near-square stack of rows instead of one flat row — see show()'s
// `layoutType` branch.
//
// Faux-3D framing (Phase 5, §5.4): a faint tonal gradient across the mat,
// plus — driven by the server's `frame` field, since the TV never makes
// its own creative decisions (§5.1) — a soft outer shadow under each
// photo and a faint inner-edge highlight, simulating a print sitting on a
// physical mat rather than a flat web image. Kept deliberately
// restrained: this is "photograph -> physical mat -> shadow -> screen"
// (§5.4), not a drop-shadow-heavy UI card.
//
// MAT_MARGIN/boxShadowFor/hexToRgba/applyMatBackground live in matStyles.ts,
// shared with VideoStage (post-Phase-8 addition) — both render single- or
// multi-slot content matted the same way.
import { applyMatBackground, boxShadowFor, MAT_MARGIN, NO_FRAME, type FrameStyle } from './matStyles';

export type { FrameStyle };

// One flex row of equally-sized, contain-fit, matted slots — the shared
// building block for both a normal (non-collage) composition and each row
// of a collage grid. `alignItems: stretch` lets a row placed inside a
// collage's column stack fill whatever height its row was allotted, the
// same way a single full-height row already fills the whole layer.
function buildRow(urls: string[], boxShadow: string): HTMLDivElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'stretch';
  row.style.justifyContent = 'center';
  row.style.width = '100%';
  row.style.height = '100%';
  row.style.minHeight = '0';

  for (const url of urls) {
    const slot = document.createElement('div');
    slot.style.flex = '1 1 0';
    slot.style.minWidth = '0';
    slot.style.minHeight = '0';
    slot.style.display = 'flex';
    slot.style.alignItems = 'center';
    slot.style.justifyContent = 'center';
    // Reserves the mat margin on every side of this photo (see
    // MAT_MARGIN) — also what separates adjacent photos in a
    // multi-slot composition, so no extra inter-slot gap is needed on
    // top of it, in either a row or a collage's stacked rows.
    slot.style.padding = MAT_MARGIN;
    slot.style.boxSizing = 'border-box';

    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    if (boxShadow) img.style.boxShadow = boxShadow;
    slot.appendChild(img);
    row.appendChild(slot);
  }

  return row;
}

// Splits `count` images into a near-square stack of row sizes with no
// empty cells — e.g. 5 -> [3, 2], not a 3x2 grid with one dead cell. Earlier
// rows absorb the remainder so row sizes never increase top to bottom.
function collageRowSizes(count: number): number[] {
  const numRows = Math.min(count, Math.max(1, Math.round(Math.sqrt(count))));
  const baseSize = Math.floor(count / numRows);
  const extra = count % numRows;
  return Array.from({ length: numRows }, (_, row) => baseSize + (row < extra ? 1 : 0));
}

export class ImageStage {
  private root: HTMLDivElement;
  private layers: [HTMLDivElement, HTMLDivElement];
  private activeLayer = 0;

  constructor(container: HTMLElement, matColor = '#111114') {
    this.root = document.createElement('div');
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.overflow = 'hidden';
    this.setMatColor(matColor);

    const makeLayer = (): HTMLDivElement => {
      const layer = document.createElement('div');
      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.display = 'flex';
      layer.style.alignItems = 'stretch';
      layer.style.justifyContent = 'center';
      layer.style.opacity = '0';
      layer.style.transition = 'opacity 1.2s ease';
      this.root.appendChild(layer);
      return layer;
    };

    this.layers = [makeLayer(), makeLayer()];
    container.appendChild(this.root);
  }

  // `textureUrl`, when given (WOOD/CORK/COTTON — colour/matMode.ts's
  // resolveMatTexture, RAW/matt-example-3.png), layers a real material
  // photo under the usual vignette instead of a perfectly flat colour.
  // Tinted with a 55%-opacity wash of the mat's own computed colour so it
  // reads as "this material, in this mat's tone" rather than the raw
  // photographed swatch showing through untouched — kept deliberately
  // subtle (a materials *hint*, not a bold pattern).
  setMatColor(color: string, textureUrl: string | null = null): void {
    applyMatBackground(this.root, color, textureUrl);
  }

  // Toggled by PresentationRenderer when switching between image and video
  // content (VideoStage, post-Phase-8 addition) — both stages' root
  // elements live in the same container simultaneously, so only the active
  // one should ever be visible/painted.
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  // One image per slot, left-to-right (or, for a collage, left-to-right
  // then top-to-bottom). A single-slot composition (the common case)
  // behaves exactly as before: one image, fully centered. `frame` and
  // `layoutType` come straight from the server's Presentation — the TV
  // never decides its own composition or framing style (§5.1).
  show(imageUrls: string[], frame: FrameStyle = NO_FRAME, layoutType?: string): void {
    const nextIndex = this.activeLayer === 0 ? 1 : 0;
    const nextLayer = this.layers[nextIndex];
    const prevLayer = this.layers[this.activeLayer];

    nextLayer.innerHTML = '';

    const boxShadow = boxShadowFor(frame);

    if (layoutType === 'collage' && imageUrls.length > 1) {
      // Near-square stack of rows, each filling its full share of height —
      // every cell is exactly filled edge to edge (mat padding only, via
      // buildRow's per-slot MAT_MARGIN), so the whole frame minus the mat
      // is used regardless of how many images the collage holds.
      const stack = document.createElement('div');
      stack.style.display = 'flex';
      stack.style.flexDirection = 'column';
      stack.style.width = '100%';
      stack.style.height = '100%';

      let cursor = 0;
      for (const rowSize of collageRowSizes(imageUrls.length)) {
        const rowEl = buildRow(imageUrls.slice(cursor, cursor + rowSize), boxShadow);
        rowEl.style.flex = '1 1 0';
        rowEl.style.minHeight = '0';
        stack.appendChild(rowEl);
        cursor += rowSize;
      }

      nextLayer.appendChild(stack);
    } else {
      nextLayer.appendChild(buildRow(imageUrls, boxShadow));
    }

    // Force a layout flush so the opacity transition actually animates.
    void nextLayer.offsetWidth;
    nextLayer.style.opacity = '1';
    prevLayer.style.opacity = '0';

    this.activeLayer = nextIndex;
  }
}
