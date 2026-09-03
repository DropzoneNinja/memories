import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { CommandType, TvSummary } from '../api/types';

interface Props {
  tv: TvSummary;
}

// Wired to the same command queue the physical remote uses (PROJECT.md
// §8) — the TV polls for these every 5s regardless of who enqueued them.
export function TransportControls({ tv }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<CommandType | null>(null);

  async function send(type: CommandType): Promise<void> {
    setError(null);
    setPending(type);
    try {
      await api.sendCommand(tv.id, type);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Command failed');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="transport-controls">
      <button type="button" onClick={() => send('PREVIOUS')} disabled={pending !== null}>
        ⏮ Previous
      </button>
      <button type="button" onClick={() => send(tv.paused ? 'RESUME' : 'PAUSE')} disabled={pending !== null}>
        {tv.paused ? '▶ Resume' : '⏸ Pause'}
      </button>
      <button type="button" onClick={() => send('NEXT')} disabled={pending !== null}>
        ⏭ Next
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
