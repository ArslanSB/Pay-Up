import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./http.server";

describe("safeReturnTo", () => {
  it("keeps same-origin paths with their query", () => {
    for (const path of ["/jars", "/link?code=WDJB-MJHT", "/link/phone?code=WDJB-MJHT&provider=google", "/"]) expect(safeReturnTo(path)).toBe(path);
  });
  it("sends anything that could leave the site to /jars (Review Focus 4)", () => {
    for (const raw of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/ /evil.example", "/€", "/\n/evil.example", "/\r/evil.example", "https://evil.example/", "javascript:alert(1)", "jars", "", null, undefined, `/${"a".repeat(600)}`]) {
      expect(safeReturnTo(raw)).toBe("/jars");
    }
  });
});
