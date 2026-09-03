// Detects the actual panel resolution rather than assuming 1920x1080
// (PROJECT.md §9.1, §9.13) — a Tizen web app runs full-viewport, so the
// window's own inner size already reflects the real panel, on-device.

export interface ScreenSize {
  width: number;
  height: number;
}

export function getScreenSize(): ScreenSize {
  const width = window.innerWidth || window.screen.width || 1920;
  const height = window.innerHeight || window.screen.height || 1080;
  return { width, height };
}

export function onScreenResize(handler: (size: ScreenSize) => void): void {
  window.addEventListener('resize', () => handler(getScreenSize()));
}
