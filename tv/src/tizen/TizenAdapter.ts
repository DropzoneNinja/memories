// Isolates every Tizen/Samsung-specific API behind one boundary so the rest
// of the TV app is testable in a normal browser (PROJECT.md §10, §15.4).
// Falls back to keyboard arrow keys when `tizen` isn't present, so this
// works in a desktop browser during development.
import { log } from '../log/Logger';

export type RemoteKey =
  | "Up"
  | "Down"
  | "Left"
  | "Right"
  | "Enter"
  | "Back"
  | "PlayPause"
  | "Next"
  | "Previous";

type KeyHandler = (key: RemoteKey) => void;

// Extra hardware keys that must be explicitly registered on Tizen before
// they start generating keydown events.
const TIZEN_KEYS_TO_REGISTER = [
  "MediaPlayPause",
  "MediaTrackNext",
  "MediaTrackPrevious",
];

function getTizen(): any {
  return (globalThis as any).tizen;
}

export class TizenAdapter {
  private handlers: KeyHandler[] = [];

  init(): void {
    const tizen = getTizen();
    log.info('tizen lifecycle: init', { runningOnTv: Boolean(tizen) });
    if (tizen) {
      try {
        for (const key of TIZEN_KEYS_TO_REGISTER) {
          tizen.tvinputdevice.registerKey(key);
        }
      } catch (err) {
        log.warn('tizen key registration failed', { message: String(err) });
      }
    }

    document.addEventListener("keydown", (event) => this.handleKeyDown(event));

    // Standard Page Visibility API, not Tizen-specific — but this is the
    // one lifecycle signal every Tizen TV app reliably gets on suspend/
    // resume (backgrounded by the TV's own app switcher, screensaver, or
    // input-source change), useful for explaining a gap in the diagnostics
    // log ("why did nothing happen for 20 minutes") without needing an
    // unverified Tizen-specific lifecycle API (PROJECT.md §15.2/§15.5).
    document.addEventListener("visibilitychange", () => {
      log.info("tizen lifecycle: visibility changed", { visible: document.visibilityState === "visible" });
    });
  }

  onKey(handler: KeyHandler): void {
    this.handlers.push(handler);
  }

  isRunningOnTv(): boolean {
    return Boolean(getTizen());
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = this.mapKey(event);
    if (key) {
      for (const handler of this.handlers) handler(key);
    }
  }

  private mapKey(event: KeyboardEvent): RemoteKey | null {
    switch (event.key) {
      case "ArrowUp":
        return "Up";
      case "ArrowDown":
        return "Down";
      case "ArrowLeft":
        return "Left";
      case "ArrowRight":
        return "Right";
      case "Enter":
        return "Enter";
      case "Backspace":
      case "GoBack":
        return "Back";
      case "MediaPlayPause":
        return "PlayPause";
      case "MediaTrackNext":
        return "Next";
      case "MediaTrackPrevious":
        return "Previous";
      default:
        return null;
    }
  }
}
