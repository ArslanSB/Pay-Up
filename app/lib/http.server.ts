export function notFound(): never {
  throw new Response("Not found", { status: 404 });
}

// A slash, then no second slash or backslash, then printable ASCII only (no whitespace, controls or non-ASCII):
// browsers strip tabs and newlines and read backslashes as slashes, which would turn "/\t/evil.example" into another
// host, and a non-ASCII character makes the Location header throw.
const RETURN_TO = /^\/(?![/\\])[\x21-\x5B\x5D-\x7E]*$/;

/** A same-origin path to land on after sign-in. Anything else is /jars. */
export function safeReturnTo(raw: string | null | undefined): string {
  return raw && raw.length <= 512 && RETURN_TO.test(raw) ? raw : "/jars";
}
