import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// No self-registration form on purpose — accounts are provisioned via
// `npm run create-user` (PROJECT.md §12: single admin-capable user model
// for now, see api/scripts/create-user.mjs).
export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      // A real 401 from the server means "wrong credentials" — show that
      // exact, deliberately generic message (don't reveal whether the
      // email exists). Anything else (network failure, the API being
      // unreachable, a 5xx) is a different problem and saying so is more
      // honest than blaming the password for it.
      setError(err instanceof ApiError && err.status === 401 ? 'Invalid email or password' : 'Could not reach the Memories API — is it running?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Memories</h1>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
