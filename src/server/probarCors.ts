import { resolvePublicOrigins, type OriginConfig } from "@/config/origins";

type ProbarCaller = "site" | "app" | "site-or-app";
type Handler = (request: Request) => Response | Promise<Response>;

const CORS_METHODS = "POST, OPTIONS";
const CORS_HEADERS = "Content-Type";

/**
 * Exact-origin CORS and request-origin enforcement for credentialed /probar APIs.
 * Missing Origin remains valid for server-to-server/local CLI diagnostics; a
 * browser-supplied unexpected Origin is rejected before the handler sees it.
 */
export function withProbarCors(
  handler: Handler,
  caller: ProbarCaller = "site",
  origins: OriginConfig = resolvePublicOrigins(process.env),
): Handler {
  return async (request) => {
    const origin = request.headers.get("origin");
    if (origin && !allowedOrigins(caller, origins).has(origin)) {
      return Response.json(
        { error: "Forbidden origin" },
        { status: 403, headers: { Vary: "Origin" } },
      );
    }

    if (request.method === "OPTIONS") {
      if (!origin) {
        return new Response(null, { status: 400, headers: { Vary: "Origin" } });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const response = await handler(request);
    if (!origin) return response;
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(corsHeaders(origin))) {
      headers.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

export function probarOptions(
  caller: ProbarCaller = "site",
  origins: OriginConfig = resolvePublicOrigins(process.env),
) {
  return withProbarCors(
    () => new Response(null, { status: 405 }),
    caller,
    origins,
  );
}

function allowedOrigins(
  caller: ProbarCaller,
  origins: OriginConfig,
): Set<string> {
  if (caller === "site") return new Set([origins.siteOrigin]);
  if (caller === "app") return new Set([origins.appOrigin]);
  return new Set([origins.siteOrigin, origins.appOrigin]);
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
    Vary: "Origin",
  };
}
