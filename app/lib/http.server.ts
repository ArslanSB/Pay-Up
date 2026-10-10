export function notFound(): never {
  throw new Response("Not found", { status: 404 });
}

// A slash, then no second slash or backslash, and no whitespace or backslash anywhere: browsers strip tabs and
// newlines and read backslashes as slashes, which would turn "/\t/evil.example" into another host.
const RETURN_TO = /^\/(?![/\\])[^\s\\]*$/;

/** A same-origin path to land on after sign-in. Anything else is /jars. */
export function safeReturnTo(raw: string | null | undefined): string {
  return raw && raw.length <= 512 && RETURN_TO.test(raw) ? raw : "/jars";
}
