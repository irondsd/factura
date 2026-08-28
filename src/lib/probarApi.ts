import { publicOrigins, type OriginConfig } from "@/config/origins";

const PROBAR_PATH = /^\/[a-z][a-z0-9-]*$/;

/** Resolve a /probar API endpoint without trusting ad-hoc environment strings. */
export function probarApiUrl(
  endpoint: string,
  origins: OriginConfig = publicOrigins,
): string {
  if (!PROBAR_PATH.test(endpoint)) {
    throw new Error(
      "A /probar API endpoint must be a single absolute path segment",
    );
  }
  const path = `/api/probar${endpoint}`;
  return origins.appOrigin === origins.siteOrigin
    ? path
    : new URL(path, origins.appOrigin).href;
}
