export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function getTimeZone(request: Request): string {
  const raw = readCookie(request.headers.get("Cookie"), "tz");
  if (!raw) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: raw });
    return raw;
  } catch {
    return "UTC";
  }
}

export function getLocale(request: Request, fallback: string): string {
  const header = request.headers.get("Accept-Language");
  if (!header) return fallback;
  const candidates = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="))?.slice(2);
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q), index };
    })
    .filter((c) => c.tag && c.tag !== "*" && Number.isFinite(c.q) && c.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of candidates) {
    try {
      const [canonical] = Intl.getCanonicalLocales(tag);
      if (canonical) return canonical;
    } catch {
      // try the next tag
    }
  }
  return fallback;
}
