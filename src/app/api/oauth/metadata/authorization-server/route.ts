import { authorizationServerMetadata } from "@/server/mcp/config";

// Reached as /.well-known/oauth-authorization-server via a rewrite in
// next.config.ts — a directory literally named `.well-known` is hidden on every
// filesystem this repo is checked out on, so the route lives at a normal path
// and the well-known URL is mapped onto it.
export const runtime = "nodejs";
// Depends on the deployment's configured base URL, so it must not be baked into
// the build output.
export const dynamic = "force-dynamic";

/** RFC 8414 authorization server metadata. Unauthenticated by design: this
 * document is how a client that knows nothing discovers the flow. */
export async function GET() {
  return Response.json(authorizationServerMetadata(), {
    headers: {
      // Public and stable. Long enough to spare the round trip on every
      // reconnect, short enough that changing the deployment's URL takes effect
      // the same day.
      "Cache-Control": "public, max-age=3600",
      // Discovery happens from browser-based clients too, and this document
      // contains nothing that is not already public.
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/** Browser-based clients preflight the discovery fetch. */
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
