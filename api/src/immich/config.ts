import { ImmichClient } from './ImmichClient.js';

let client: ImmichClient | null = null;

// Lazy singleton: only the Memories API ever holds this client/credential
// (PROJECT.md §6) — nothing else in this codebase should read
// IMMICH_API_KEY directly.
export function getImmichClient(): ImmichClient {
  if (client) return client;

  const baseUrl = process.env.IMMICH_BASE_URL;
  const apiKey = process.env.IMMICH_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('IMMICH_BASE_URL and IMMICH_API_KEY must be set (see .env.example)');
  }

  client = new ImmichClient({ baseUrl, apiKey });
  return client;
}
