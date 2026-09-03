// Full-screen composition renderer: contain-fit (never crop, never
// stretch — PROJECT.md §5.2), centered on a mat/background colour, with a
// simple crossfade between compositions (§5.5). Renders 1-3 images side by
// side per the server's layout slots (Phase 4) — each slot gets an equal
// share of the width and contain-fits its own image independently, so a
// two/three-portrait composition never crops or stretches any one photo
// to match the others. Per-slot mat framing/shadow is Phase 5's job
// (faux-3D framing); this just positions the images.

export class ImageStage {
  private root: HTMLDivElement;
  private layers: [HTMLDivElement, HTMLDivElement];
  private activeLayer = 0;

  constructor(container: HTMLElement, matColor = '#111114') {
    this.root = document.createElement('div');
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.background = matColor;
    this.root.style.overflow = 'hidden';

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
    this.root.style.background = color;
  }

  // One image per slot, left-to-right. A single-slot composition (the
  // common case) behaves exactly as before: one image, fully centered.
  show(imageUrls: string[]): void {
    const nextIndex = this.activeLayer === 0 ? 1 : 0;
    const nextLayer = this.layers[nextIndex];
    const prevLayer = this.layers[this.activeLayer];

    nextLayer.innerHTML = '';
    // A small gap between slots visually separates grouped photos until
    // Phase 5 gives each one its own mat/shadow.
    nextLayer.style.gap = imageUrls.length > 1 ? '1.5%' : '0';

    for (const url of imageUrls) {
      const slot = document.createElement('div');
      slot.style.flex = '1 1 0';
      slot.style.minWidth = '0';
      slot.style.display = 'flex';
      slot.style.alignItems = 'center';
      slot.style.justifyContent = 'center';

      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';
      slot.appendChild(img);
      nextLayer.appendChild(slot);
    }

    // Force a layout flush so the opacity transition actually animates.
    void nextLayer.offsetWidth;
    nextLayer.style.opacity = '1';
    prevLayer.style.opacity = '0';

    this.activeLayer = nextIndex;
  }
}
