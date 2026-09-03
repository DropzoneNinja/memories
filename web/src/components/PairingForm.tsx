import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';

interface Props {
  onPaired: (tvId: string) => void;
}

// PROJECT.md §5.9: the TV shows a short numeric code, entered here to
// name it and claim it — never the other way around (no typing IPs or
// credentials into the TV itself).
export function PairingForm({ onPaired }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tv = await api.completePairing(code.trim(), name.trim());
      onPaired(tv.id);
      setCode('');
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Pairing failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="pairing-form" onSubmit={handleSubmit}>
      <h2>Pair a TV</h2>
      <p className="hint">Enter the code shown on the TV&rsquo;s pairing screen.</p>
      <input
        placeholder="Pairing code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        required
      />
      <input placeholder="Name (e.g. Lounge)" value={name} onChange={(e) => setName(e.target.value)} required />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Pairing…' : 'Pair'}
      </button>
    </form>
  );
}
