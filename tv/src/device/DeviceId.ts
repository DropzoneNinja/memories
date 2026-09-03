// A TV-generated, locally-persisted identifier — decoupled from any
// Samsung/Tizen hardware serial. Simpler and portable (works the same in
// a desktop browser during dev), and the pairing flow (PROJECT.md §5.9)
// only ever needs *a* stable id, not specifically the hardware's.
const STORAGE_KEY = 'memories.deviceId';

function generateId(): string {
  // crypto.randomUUID() isn't guaranteed on older Tizen WebKit versions
  // (PROJECT.md §15.2 — don't assume Tizen APIs are identical across TV
  // generations); fall back to a good-enough random id.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = generateId();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
