import { log } from '../log/Logger.js';
import { currentMemoryText } from './MemorySampler.js';
import type { DiagnosticsSnapshot } from '../playback/PlaybackController.js';

// Hidden diagnostics view (PROJECT.md §11.2 milestone 8, §9.15): connection
// status, current/next asset, cache size, last sync, last error, app
// version — reachable but never shown during normal playback (§6's "the
// TV's own on-screen surface is limited to... a diagnostics view reachable
// but hidden during normal viewing"). Toggled by main.ts's hidden key
// chord, never auto-shown. Deliberately a small corner panel, not a
// full-screen takeover — it must never look like "a normal website" (§13)
// or leave the photo fully obscured while someone's debugging live.
export interface DiagnosticsViewOptions {
  deviceId: string;
  apiBaseUrl: string;
  getSnapshot: () => DiagnosticsSnapshot;
}

const REFRESH_MS = 2000;

function appVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
}

function formatAgo(at: number | null): string {
  if (at === null) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export class DiagnosticsView {
  private root: HTMLDivElement;
  private pre: HTMLPreElement;
  private refreshTimer: number | null = null;
  private visible = false;

  constructor(
    container: HTMLElement,
    private readonly options: DiagnosticsViewOptions,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      right: '2vw',
      bottom: '2vh',
      maxWidth: '44vw',
      padding: '1vw 1.2vw',
      background: 'rgba(8, 8, 10, 0.88)',
      color: '#d8d8d8',
      fontFamily: 'monospace',
      fontSize: '1vw',
      lineHeight: '1.5',
      borderRadius: '10px',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      zIndex: '1000',
      display: 'none',
      pointerEvents: 'none',
    } as CSSStyleDeclaration);

    this.pre = document.createElement('pre');
    Object.assign(this.pre.style, { margin: '0', font: 'inherit', whiteSpace: 'pre-wrap' });
    this.root.appendChild(this.pre);
    container.appendChild(this.root);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.root.style.display = 'block';
    this.render();
    this.refreshTimer = window.setInterval(() => this.render(), REFRESH_MS);
    log.info('diagnostics view opened');
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.style.display = 'none';
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private render(): void {
    const s = this.options.getSnapshot();
    const problem = log.lastProblem();
    const memory = currentMemoryText();

    const lines = [
      `Memories TV  v${appVersion()}`,
      `device      ${this.options.deviceId}`,
      `api         ${this.options.apiBaseUrl}`,
      `connection  ${s.online ? 'online' : 'OFFLINE'}${s.paused ? ' · paused' : ''}`,
      `last sync   ${formatAgo(s.lastSyncAt)}`,
      `queue       ${s.queueLength} item(s)`,
      `current     ${s.currentFilename ?? s.currentPresentationId ?? '—'}`,
      `next        ${s.nextFilename ?? s.nextPresentationId ?? '—'}`,
      `cache       ${s.cacheEntries} image(s), ${formatBytes(s.cacheBytes)}`,
      `memory      ${memory ?? 'n/a'}`,
      `last problem ${problem ? `${formatAgo(problem.at)} — ${problem.event}` : 'none'}`,
    ];
    this.pre.textContent = lines.join('\n');
  }
}
