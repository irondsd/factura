import { resolvePublicOrigins } from "@/config/origins";

export const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

type SessionCookieEnv = NodeJS.ProcessEnv & {
  SESSION_COOKIE_DOMAIN?: string;
};

/** The versioned cookie contract shared by the site and app deployments. */
export function sessionCookieConfig(env: SessionCookieEnv = process.env) {
  const { siteOrigin } = resolvePublicOrigins(env);
  const secure = new URL(siteOrigin).protocol === "https:";
  const domain = parseCookieDomain(env.SESSION_COOKIE_DOMAIN);

  if (domain && !secure) {
    throw new Error("SESSION_COOKIE_DOMAIN requires an HTTPS site origin");
  }

  return {
    name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure,
      ...(domain ? { domain } : {}),
    },
  };
}

function parseCookieDomain(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (
    value.trim() !== value ||
    !value.startsWith(".") ||
    value.length < 3 ||
    value.includes("/") ||
    value.includes(":") ||
    /[\\\s\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(
      "SESSION_COOKIE_DOMAIN must be a parent domain such as .factura.uno",
    );
  }
  return value.toLowerCase();
}
