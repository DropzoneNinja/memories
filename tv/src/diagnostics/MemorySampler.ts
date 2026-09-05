import { log } from '../log/Logger.js';

// `performance.memory` is a non-standard, Chromium-only API. Tizen's
// browser engine has historically been Chromium/Blink-based and has
// exposed it in practice, but this isn't part of any spec and isn't
// guaranteed across Tizen versions (PROJECT.md §15.2 — don't assume Tizen
// APIs are identical across TV generations). Feature-detected and a
// silent no-op where it's missing, rather than throwing or claiming to
// profile something it can't actually measure (§15.5) — the closest
// honest substitute for real device memory profiling that's available
// without an attached debugger.
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function readMemory(): PerformanceMemory | null {
  const memory = (performance as Performance & { memory?: PerformanceMemory }).memory;
  return memory ?? null;
}

function toMB(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

// Logged at 'info' but on a long interval (main.ts) — infrequent enough to
// stay "quiet in normal operation" (§9.15) while still leaving a trail to
// spot slow growth across a multi-day run.
export function startMemorySampling(intervalMs: number): () => void {
  const timer = window.setInterval(() => {
    const memory = readMemory();
    if (!memory) return;
    log.info('memory sample', {
      usedMB: toMB(memory.usedJSHeapSize),
      totalMB: toMB(memory.totalJSHeapSize),
      limitMB: toMB(memory.jsHeapSizeLimit),
    });
  }, intervalMs);
  return () => window.clearInterval(timer);
}

// For the diagnostics view's live display — null (rendered as "n/a") on
// any engine that doesn't expose this.
export function currentMemoryText(): string | null {
  const memory = readMemory();
  if (!memory) return null;
  return `${toMB(memory.usedJSHeapSize)}MB / ${toMB(memory.jsHeapSizeLimit)}MB`;
}
