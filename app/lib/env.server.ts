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
}

function pair(id: string | undefined, secret: string | undefined): Credentials | null {
  return id && secret ? { clientId: id, clientSecret: secret } : null;
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
  };
}

let cached: Env | null = null;

export function env(): Env {
  cached ??= readEnv();
  return cached;
}
