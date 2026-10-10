export interface Credentials {
  clientId: string;
  clientSecret: string;
}

export interface Env {
  sessionSecret: string;
  appUrl: string;
  databasePath: string;
  appLocale: string;
  google: Credentials | null;
  github: Credentials | null;
  isProduction: boolean;
  /** Who runs this deployment, shown on the legal pages. */
  operatorName: string;
  contactEmail: string | null;
  /** SHA-256 fingerprints of the Android app's signing certificates, for App Links. */
  androidCertFingerprints: string[];
}

function pair(id: string | undefined, secret: string | undefined): Credentials | null {
  return id && secret ? { clientId: id, clientSecret: secret } : null;
}

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function fingerprints(raw: string | undefined): string[] {
  const list = (raw ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  for (const fp of list) {
    if (!FINGERPRINT.test(fp)) throw new Error("ANDROID_CERT_FINGERPRINTS must be SHA-256 fingerprints like AB:CD:…, separated by commas");
  }
  return list;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const sessionSecret = source.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must be set and at least 16 characters long");
  }
  const appUrl = source.APP_URL;
  if (!appUrl) throw new Error("APP_URL must be set, for example http://localhost:3000");
  return {
    sessionSecret,
    appUrl: appUrl.replace(/\/+$/, ""),
    databasePath: source.DATABASE_PATH || "./data/payup.db",
    appLocale: source.APP_LOCALE || "es-ES",
    google: pair(source.GOOGLE_CLIENT_ID, source.GOOGLE_CLIENT_SECRET),
    github: pair(source.GITHUB_CLIENT_ID, source.GITHUB_CLIENT_SECRET),
    isProduction: source.NODE_ENV === "production",
    operatorName: source.OPERATOR_NAME || "[operator name not set]",
    contactEmail: source.CONTACT_EMAIL || null,
    androidCertFingerprints: fingerprints(source.ANDROID_CERT_FINGERPRINTS),
  };
}

let cached: Env | null = null;

export function env(): Env {
  cached ??= readEnv();
  return cached;
}
