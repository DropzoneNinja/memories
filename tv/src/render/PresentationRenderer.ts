import { ImageStage } from './ImageStage';
import type { Presentation } from '../api/types';

// Consumes real server-provided Presentation objects (PROJECT.md §5.1),
// driving ImageStage from them. Renders every slot in a multi-image
// composition (Phase 4) — layout.slots gives the display order (left to
// right), which presentation.assets is looked up against by id rather
// than assumed to already be in that order.
export class PresentationRenderer {
  private stage: ImageStage;
  private advanceTimer: number | null = null;
  private onAdvance: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    private readonly resolveUrl: (relativeUrl: string) => string,
  ) {
    this.stage = new ImageStage(container);
  }

  setOnAdvance(callback: () => void): void {
    this.onAdvance = callback;
  }

  render(presentation: Presentation, autoAdvance = true): void {
    this.clearTimer();
    this.stage.setMatColor(presentation.background.colour);

    const assetsById = new Map(presentation.assets.map((asset) => [asset.id, asset]));
    const urls = presentation.layout.slots.map((slot) => {
      const asset = assetsById.get(slot.assetId) ?? presentation.assets[0];
      return this.resolveUrl(asset.url);
    });
    this.stage.show(urls, presentation.frame);

    if (autoAdvance) {
      this.advanceTimer = window.setTimeout(() => {
        this.onAdvance?.();
      }, presentation.duration * 1000);
    }
  }

  clearTimer(): void {
    if (this.advanceTimer !== null) {
      window.clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }
}
