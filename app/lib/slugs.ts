export const SLUG_MESSAGE = "Use 3 to 40 lowercase letters, digits or dashes.";
export const SLUG_TAKEN_MESSAGE = "That link is taken.";

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
const FALLBACK = "jar";

/** Lowercase, accents stripped, runs of anything else become one dash, 3 to 40 chars. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return trimToMax(slug).length >= SLUG_MIN ? trimToMax(slug) : FALLBACK;
}

function trimToMax(slug: string): string {
  return slug.slice(0, SLUG_MAX).replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:-?[a-z0-9])*$/.test(slug) && slug.length >= SLUG_MIN && slug.length <= SLUG_MAX;
}

/** base + "-" + suffix, shortening base so the whole thing fits SLUG_MAX. */
export function withSuffix(base: string, suffix: string): string {
  const room = SLUG_MAX - suffix.length - 1;
  return `${base.slice(0, room).replace(/-+$/g, "")}-${suffix}`;
}
