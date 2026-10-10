import { createHash, randomBytes, randomInt } from "node:crypto";

export const ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function draw(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function newId(): string {
  return draw(ID_ALPHABET, 16);
}

/** Short suffix appended to a title-derived slug when that slug is taken. */
export function newSlugSuffix(): string {
  return draw(SLUG_ALPHABET, 4);
}

/** Consonants only: no accidental words, no look-alikes. Link codes read like WDJB-MJHT. */
export const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

/** 32 random bytes, base64url. Device tokens and link device codes. */
export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** The short code a person types or compares, without its dash. */
export function newUserCode(): string {
  return draw(USER_CODE_ALPHABET, 8);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
