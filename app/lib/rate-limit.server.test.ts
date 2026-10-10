import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.server";

describe("createRateLimiter", () => {
  it("allows the limit per key per window, then refuses until the window ends", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([limiter.hit("a", 0), limiter.hit("a", 10), limiter.hit("a", 20)]).toEqual([true, true, false]);
    expect(limiter.hit("b", 20)).toBe(true);
    expect(limiter.hit("a", 1000)).toBe(true);
  });
});
