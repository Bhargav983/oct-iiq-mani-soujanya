const CHAT_SESSION_KEY = 'aira.chat_session_id';

export function createUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getChatSessionId(): string {
  try {
    const existing = sessionStorage.getItem(CHAT_SESSION_KEY);
    if (existing) return existing;
    const created = createUuidV4();
    sessionStorage.setItem(CHAT_SESSION_KEY, created);
    return created;
  } catch {
    return memorySessionId();
  }
}

export function resetChatSessionId(): string {
  const created = createUuidV4();
  try { sessionStorage.setItem(CHAT_SESSION_KEY, created); } catch { /* use the in-memory fallback */ }
  memorySessionId(created);
  return created;
}

let fallbackSessionId: string | undefined;
function memorySessionId(next?: string): string {
  if (next) fallbackSessionId = next;
  return fallbackSessionId ??= createUuidV4();
}
