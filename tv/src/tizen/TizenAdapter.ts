// Isolates every Tizen/Samsung-specific API behind one boundary so the rest
// of the TV app is testable in a normal browser (PROJECT.md §10, §15.4).
// Falls back to keyboard arrow keys when `tizen` isn't present, so this
// works in a desktop browser during development.

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
    if (tizen) {
      try {
        for (const key of TIZEN_KEYS_TO_REGISTER) {
          tizen.tvinputdevice.registerKey(key);
        }
      } catch (err) {
        console.warn("Tizen key registration failed", err);
      }
    }

    document.addEventListener("keydown", (event) => this.handleKeyDown(event));
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
