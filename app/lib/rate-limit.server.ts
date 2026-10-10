export interface RateLimiter {
  /** Counts one hit for the key; false once the key is over its limit for the current window. */
  hit(key: string, now?: number): boolean;
}

/** Fixed-window counter held in memory. Enough for the single server process this app runs as. */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || now - current.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        if (windows.size > 10_000) {
          for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
        }
        return true;
      }
      current.count += 1;
      return current.count <= limit;
    },
  };
}

/** POST /api/v1/links: 10 per client address per 10 minutes (spec 5.3). */
export const linkStartLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });
