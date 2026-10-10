import { describe, expect, it } from "vitest";
import { createRateLimiter, rateLimitKey } from "./rate-limit.server";

describe("createRateLimiter", () => {
  it("allows the limit per key per window, then refuses until the window ends", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([limiter.hit("a", 0), limiter.hit("a", 10), limiter.hit("a", 20)]).toEqual([true, true, false]);
    expect(limiter.hit("b", 20)).toBe(true);
    expect(limiter.hit("a", 1000)).toBe(true);
  });
});

describe("rateLimitKey", () => {
  it("leaves IPv4 and unknown alone, and unwraps IPv4-mapped IPv6", () => {
    expect(rateLimitKey("203.0.113.9")).toBe("203.0.113.9");
    expect(rateLimitKey("unknown")).toBe("unknown");
    expect(rateLimitKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });
  it("counts an IPv6 address by its /64", () => {
    expect(rateLimitKey("2001:db8:1:2:3:4:5:6")).toBe("2001:0db8:0001:0002::/64");
    expect(rateLimitKey("2001:db8:1:2:3:4:5:6")).toBe(rateLimitKey("2001:db8:1:2:aaaa::1"));
    expect(rateLimitKey("2001:DB8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(rateLimitKey("::1")).toBe("0000:0000:0000:0000::/64");
  });
});
