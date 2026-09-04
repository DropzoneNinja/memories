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

export interface FrameStyle {
  shadow: string; // 'subtle' | 'none'
  bevel: string; // 'inner' | 'none'
}

const NO_FRAME: FrameStyle = { shadow: 'none', bevel: 'none' };

// Uniform mat margin reserved around every photo, on every side. `vmin`
// resolves against the viewport, not each slot's own (possibly narrower)
// box, so a two/three-portrait composition's individual photos get the
// same real-pixel margin as a single full-screen photo — every photo
// matted consistently, not "whatever's left after contain-fit happened
// to land." Without this, a photo whose aspect ratio exactly matches its
// slot touches that slot's edges directly, leaving no mat margin (and
// nothing for the bevel highlight/shadow to show up against) on
// whichever side(s) contain-fit maxed out — caught on real hardware: a
// height-constrained photo touched the screen's top and bottom edges
// exactly, so the inner-edge highlight had nowhere to render there.
const MAT_MARGIN = '2.5vmin';

function boxShadowFor(frame: FrameStyle): string {
  const layers: string[] = [];
  if (frame.shadow !== 'none') {
    // The photo lifted slightly off the mat, plus a hairline edge that
    // grounds it — both very soft, never a hard-edged web-card shadow.
    layers.push('0 3px 14px rgba(0,0,0,0.35)', '0 0 0 1px rgba(0,0,0,0.08)');
  }
  if (frame.bevel !== 'none') {
    // A full-perimeter hairline highlight — the bevel-cut inner edge of
    // a real mat is visible all the way around a mounted print, not just
    // along one side. `inset 0 0 0 1px` (zero offset, 1px spread) draws
    // that evenly on all four edges; an offset inset shadow like
    // `inset 0 1px 0` only ever paints one side, which is what this
    // replaced (caught on real hardware: the highlight only showed up on
    // the top edge).
    layers.push('inset 0 0 0 1px rgba(255,255,255,0.07)');
  }
  return layers.join(', ');
}

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

  setMatColor(color: string): void {
    // A very faint vignette over the flat mat colour — the "faint tonal
    // gradient" §5.4 asks for. Subtle enough that it reads as a physical
    // surface catching light unevenly, not as a visible design element.
    this.root.style.background = `radial-gradient(ellipse at center, rgba(255,255,255,0.025), rgba(0,0,0,0.06)), ${color}`;
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
