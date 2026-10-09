import { randomInt } from "node:crypto";

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
