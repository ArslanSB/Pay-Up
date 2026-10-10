import { describe, expect, it } from "vitest";
import { assetLinks } from "./assetlinks.server";

const FP = Array.from({ length: 32 }, () => "AB").join(":");

describe("assetLinks", () => {
  it("lets com.arslansb.payup handle this site's links", async () => {
    const response = assetLinks([FP]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "com.arslansb.payup", sha256_cert_fingerprints: [FP] },
      },
    ]);
  });
  it("404s until fingerprints are configured", () => {
    expect(assetLinks([]).status).toBe(404);
  });
});
