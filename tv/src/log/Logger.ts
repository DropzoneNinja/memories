// Structured logging for the TV client (PROJECT.md §9.15): "useful for
// development but quiet in normal operation... sufficient to debug a TV
// that 'just stopped updating' days later." Every entry (regardless of
// whether it's actually printed) lands in a small ring buffer that the
// diagnostics view (diagnostics/DiagnosticsView.ts) reads from — so even a
// quiet, unattended TV keeps enough recent history to explain itself once
// someone finally looks, without needing an sdb console attached at the
// moment something went wrong.
//
// Never pass credentials/tokens here — moot in practice, since the TV
// never holds any (PROJECT.md §6/§13), but keep the habit anyway.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  event: string;
  fields?: Record<string, unknown>;
  at: number;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const RING_SIZE = 200;

export class Logger {
  private ring: LogEntry[] = [];

  constructor(private level: LogLevel) {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(event: string, fields?: Record<string, unknown>): void {
    this.write('debug', event, fields);
  }

  info(event: string, fields?: Record<string, unknown>): void {
    this.write('info', event, fields);
  }

  warn(event: string, fields?: Record<string, unknown>): void {
    this.write('warn', event, fields);
  }

  error(event: string, fields?: Record<string, unknown>): void {
    this.write('error', event, fields);
  }

  // Most-recent-last, capped at `limit` — what the diagnostics view shows.
  recent(limit = 50): LogEntry[] {
    return this.ring.slice(-limit);
  }

  // The most recent warn/error, if any — "last error" on the diagnostics
  // view. Deliberately includes warn: an offline transition or a retried
  // request is exactly the kind of thing worth surfacing there even though
  // it isn't a hard failure.
  lastProblem(): LogEntry | null {
    for (let i = this.ring.length - 1; i >= 0; i--) {
      const entry = this.ring[i];
      if (entry.level === 'warn' || entry.level === 'error') return entry;
    }
    return null;
  }

  private write(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    const entry: LogEntry = { level, event, fields, at: Date.now() };
    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.shift();

    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const args: unknown[] = fields ? [event, fields] : [event];
    switch (level) {
      case 'debug':
        console.debug(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
    }
  }
}

// Quiet ('warn') by default so a real, unattended TV doesn't spam its
// console — verbose ('debug') automatically under `vite dev` for local
// iteration. Guarded rather than a bare `import.meta.env.DEV` access:
// this module is also imported by node:test-run unit tests (tsx, not
// Vite), where `import.meta.env` doesn't exist at all.
const DEFAULT_LEVEL: LogLevel =
  typeof import.meta.env !== 'undefined' && import.meta.env.DEV ? 'debug' : 'warn';

export const log = new Logger(DEFAULT_LEVEL);
