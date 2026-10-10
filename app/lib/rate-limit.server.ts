export interface RateLimiter {
  /** Counts one hit for the key; false once the key is over its limit for the current window. */
  hit(key: string, now?: number): boolean;
}

/** Expands an IPv6 address (with "::" compression) to its eight hextets, each padded to four digits. */
function expandIpv6(ip: string): string[] {
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0");
  return [...left, ...fill, ...right].map((hextet) => hextet.toLowerCase().padStart(4, "0"));
}

/** The address a client is counted by: IPv4 as is, an IPv4-mapped IPv6 address as its IPv4, any other IPv6 address as its /64. */
export function rateLimitKey(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;
  return `${expandIpv6(ip).slice(0, 4).join(":")}::/64`;
}

/** Fixed-window counter held in memory. Enough for the single server process this app runs as. */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = 0;
  return {
    hit(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || now - current.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        if (windows.size > 10_000 && now - lastSweep >= windowMs) {
          lastSweep = now;
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
