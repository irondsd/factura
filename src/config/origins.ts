export type OriginConfig = {
  siteOrigin: string;
  appOrigin: string;
};

export type OriginEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

const PRODUCTION_SITE_ORIGIN = "https://factura.uno";
const LOCAL_SITE_ORIGIN = "http://localhost:4000";

/**
 * Parse an environment URL as an origin, not an arbitrary URL.
 *
 * Origins are a security boundary in the split deployment: accepting a path,
 * credentials, or an unexpected insecure host here would quietly weaken the
 * login-return and CORS allowlists that consume this configuration.
 */
export function parseOrigin(name: string, value: string): string {
  const raw = value.trim();
  if (
    raw !== value ||
    raw.length === 0 ||
    /[\\\u0000-\u001f\u007f]/.test(raw)
  ) {
    throw new Error(`${name} must be a non-empty URL origin`);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL origin`);
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must not include credentials, a path, or a query`);
  }

  const isLoopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error(
      `${name} must use HTTPS (HTTP is allowed only for local development)`,
    );
  }

  return url.origin;
}

/** Browser-visible origins. These are the only origin values client code may use. */
export function resolvePublicOrigins(env: OriginEnv): OriginConfig {
  const defaultSite =
    env.NODE_ENV === "production" ? PRODUCTION_SITE_ORIGIN : LOCAL_SITE_ORIGIN;
  const siteOrigin = parseOrigin(
    "NEXT_PUBLIC_SITE_URL",
    env.NEXT_PUBLIC_SITE_URL ?? defaultSite,
  );

  // Keeping the app on the site origin is the monolith-compatible default.
  // The split becomes active only when NEXT_PUBLIC_APP_URL is configured.
  const appOrigin = parseOrigin(
    "NEXT_PUBLIC_APP_URL",
    env.NEXT_PUBLIC_APP_URL ?? siteOrigin,
  );

  return { siteOrigin, appOrigin };
}

export const publicOrigins = resolvePublicOrigins({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
