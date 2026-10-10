export const ANDROID_PACKAGE = "com.arslansb.payup";

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * Digital Asset Links: lets the Android app open payup links such as a watch's /link (spec 5.5).
 * 404 until configured; 500 (and a log line) if a configured fingerprint is malformed.
 */
export function assetLinks(fingerprints: string[]): Response {
  if (fingerprints.length === 0) return new Response("Not found", { status: 404 });
  if (!fingerprints.every((fp) => FINGERPRINT.test(fp))) {
    console.error("[assetlinks] ANDROID_CERT_FINGERPRINTS must be SHA-256 fingerprints like AB:CD:…, separated by commas");
    return new Response("ANDROID_CERT_FINGERPRINTS is malformed", { status: 500 });
  }
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
