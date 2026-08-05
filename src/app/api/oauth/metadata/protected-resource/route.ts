import { protectedResourceMetadata } from "@/server/mcp/config";

// Reached as /.well-known/oauth-protected-resource (and the RFC 9728
// path-insertion form, /.well-known/oauth-protected-resource/api/mcp) via
// rewrites in next.config.ts. Both forms are in use by real clients, so both
// map here and return the same document.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 9728 protected resource metadata: what this resource is, and which
 * authorization server can issue tokens for it. The `WWW-Authenticate` header
 * on a 401 from /api/mcp points here, and this is what turns "I got a 401" into
 * "I know where to send the user". */
export async function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, MCP-Protocol-Version",
      "Access-Control-Max-Age": "86400",
    },
  });
}
