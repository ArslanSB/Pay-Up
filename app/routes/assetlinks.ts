import { assetLinks } from "../lib/assetlinks.server";
import { env } from "../lib/env.server";

// A route rather than a static file: express.static ignores dot-folders such as .well-known.
export function loader() {
  return assetLinks(env().androidCertFingerprints);
}
