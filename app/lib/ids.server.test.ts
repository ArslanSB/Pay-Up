import { describe, expect, it } from "vitest";
import { newId, newSecret, newSlugSuffix, newUserCode, sha256Hex, SLUG_ALPHABET, USER_CODE_ALPHABET } from "./ids.server";

describe("ids", () => {
  it("newId is 16 url-safe chars", () => {
    expect(newId()).toMatch(/^[0-9A-Za-z]{16}$/);
  });
  it("newSlugSuffix is 4 lowercase chars from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const suffix = newSlugSuffix();
      expect(suffix).toHaveLength(4);
      expect(suffix).toBe(suffix.toLowerCase());
      for (const ch of suffix) expect(SLUG_ALPHABET).toContain(ch);
    }
    expect(SLUG_ALPHABET).not.toMatch(/[0O1lI]/);
  });
  it("does not repeat across 1000 draws", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(seen.size).toBe(1000);
  });
});

describe("secrets", () => {
  it("newSecret is 32 random bytes in base64url", () => {
    const secret = newSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSecret()).not.toBe(secret);
  });
  it("newUserCode is 8 characters from the consonant alphabet", () => {
    expect(USER_CODE_ALPHABET).toBe("BCDFGHJKLMNPQRSTVWXZ");
    for (let i = 0; i < 200; i++) expect(newUserCode()).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/);
  });
  it("sha256Hex hashes to lowercase hex", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
