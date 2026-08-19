import { db } from "@/db";
import { handleCmsMessage } from "@/cms/mcp/handler";
import { resolveCmsToken } from "@/cms/mcp/tokens";
import { ASSUMED_PROTOCOL_VERSION, LATEST_PROTOCOL_VERSION, parseMessage, RPC, rpcError, SUPPORTED_PROTOCOL_VERSIONS } from "@/server/mcp/protocol";
import { limitKey, MCP_CALL, take } from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version", "Access-Control-Expose-Headers": "MCP-Protocol-Version" } as const;

export async function POST(request: Request) {
  const limited = take(limitKey(request, "cms:mcp"), MCP_CALL);
  if (!limited.ok) return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...CORS, "Retry-After": String(limited.retryAfterSec) } });
  const version = request.headers.get("mcp-protocol-version");
  if (version && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) return Response.json({ error: "unsupported_protocol_version", supported: SUPPORTED_PROTOCOL_VERSIONS }, { status: 400, headers: CORS });
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const caller = bearer ? await resolveCmsToken(bearer, db) : null;
  if (!caller) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json(rpcError(0, RPC.PARSE_ERROR, "Request body is not valid JSON."), { status: 400, headers: CORS }); }
  const raw = Array.isArray(body) ? body : [body];
  const responses = await Promise.all(raw.map(async (value) => { const parsed = parseMessage(value); return parsed.ok ? handleCmsMessage(parsed.message, caller) : rpcError(0, RPC.INVALID_REQUEST, parsed.reason); }));
  const answered = responses.filter((response) => response !== null);
  const headers = { ...CORS, "Cache-Control": "no-store", "MCP-Protocol-Version": version ?? ASSUMED_PROTOCOL_VERSION };
  if (!answered.length) return new Response(null, { status: 202, headers });
  return Response.json(Array.isArray(body) ? answered : answered[0], { headers });
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400", "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION } }); }
