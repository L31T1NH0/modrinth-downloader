const WINDOW_MS = 60_000;
const MAX_REQUESTS = 50;

const store = new Map<string, number[]>();
let lastCleanup = Date.now();

/** Sweep stale entries at most once per window to prevent unbounded growth. */
function cleanup(now: number) {
  if (now - lastCleanup < WINDOW_MS) return;
  lastCleanup = now;
  for (const [key, timestamps] of store) {
    const recent = timestamps.filter(t => now - t < WINDOW_MS);
    if (recent.length === 0) store.delete(key);
    else store.set(key, recent);
  }
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  cleanup(now);
  const recent = (store.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((recent[0] + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }
  recent.push(now);
  store.set(ip, recent);
  return { allowed: true };
}
