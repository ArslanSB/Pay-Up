import { describe, expect, it } from "vitest";
import { newId, newSlugSuffix, SLUG_ALPHABET } from "./ids.server";

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
