import "server-only";
import {
  isNotification,
  type JsonRpcMessage,
  type JsonRpcResponse,
  RPC,
  rpcError,
  rpcResult,
} from "@/server/mcp/protocol";
import { cmsToolListing, findCmsTool } from "./tools";
import { hasScope, type CmsTokenCaller } from "./tokens";
import { CmsValidationError } from "@/cms/server/errors";
import { db } from "@/db";
import { cmsAuditLogs } from "@/db/schema";

export async function handleCmsMessage(
  message: JsonRpcMessage,
  caller: CmsTokenCaller,
): Promise<JsonRpcResponse | null> {
  if (isNotification(message)) return null;
  const id = message.id as string | number;
  if (message.method === "initialize")
    return rpcResult(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: "factura-cms",
        title: "Factura CMS",
        version: "1.0.0",
      },
      instructions: [
        "Use get_content before update_content. Every mutation requires the current lockVersion.",
        "Editing is always safe: update_content saves a shared working copy that no reader can see, so a page that is already published keeps serving its last publication while you work. Save it normally, without asking.",
        "set_content_status is the only tool that changes what the public sees, and it needs the human's explicit go-ahead each time, in both directions. 'published' publishes the working copy as a new immutable publication; 'draft' takes the page down.",
        "A page keeps its working copy, a temporary checkpoint, the public preview snapshot, and the current publication plus three previous ones — list_content_versions shows exactly those. restore_content_version copies one back into the working copy without publishing anything.",
        "This endpoint cannot delete anything: there is no delete tool, and pages are retired by status, not removed. Deletion is a browser-only action a human performs at /cms.",
      ].join(" "),
    });
  if (message.method === "ping") return rpcResult(id, {});
  if (message.method === "tools/list")
    return rpcResult(id, { tools: cmsToolListing(caller.scopes) });
  if (message.method !== "tools/call")
    return rpcError(
      id,
      RPC.METHOD_NOT_FOUND,
      `Unknown method: ${message.method}`,
    );
  const params = message.params ?? {};
  if (typeof params.name !== "string")
    return rpcError(id, RPC.INVALID_PARAMS, "Missing tool name.");
  const tool = findCmsTool(params.name);
  if (!tool || !hasScope(caller.scopes, tool.scope))
    return rpcResult(
      id,
      toolError("This token does not have access to that tool."),
    );
  const parsed = tool.schema.safeParse(params.arguments ?? {});
  if (!parsed.success)
    return rpcResult(
      id,
      toolError("Invalid arguments.", { diagnostics: parsed.error.issues }),
    );
  try {
    const output = await tool.run(caller, parsed.data);
    if (tool.scope === "cms:write")
      await audit(
        caller.userId,
        pageId(parsed.data) ?? pageId(output),
        tool.name,
        "ok",
      );
    return rpcResult(id, toolSuccess(output));
  } catch (error) {
    if (tool.scope === "cms:write")
      await audit(caller.userId, pageId(parsed.data), tool.name, "error");
    if (error instanceof CmsValidationError)
      return rpcResult(
        id,
        toolError(error.message, { diagnostics: error.diagnostics }),
      );
    return rpcResult(
      id,
      toolError(
        error instanceof Error ? error.message : "CMS operation failed.",
      ),
    );
  }
}

function pageId(input: unknown): string | null {
  return typeof input === "object" &&
    input !== null &&
    "id" in input &&
    typeof input.id === "string"
    ? input.id
    : null;
}
/** Record who did what, without ever being the reason a request fails.
 *
 * `page_id` is a real foreign key, and the id in a failed mutation is very
 * often one that does not exist — a stale id, or a typo from an agent, which is
 * the ordinary case this endpoint has to survive. That insert then violates the
 * constraint, and an exception thrown while *reporting* an error replaced a
 * handled tool failure with an unhandled one: the route's `Promise.all`
 * rejected and the client got an HTML 500 in place of a JSON-RPC response.
 *
 * So the reference is dropped rather than the record: a second attempt with no
 * `page_id` still says who tried what and how it ended, which is what the trail
 * is for. If even that fails the audit is lost and logged — accountability for
 * an internal tool is not worth failing the operation over. */
async function audit(
  actorId: string,
  pageId: string | null,
  operation: string,
  result: string,
) {
  const row = { actorId, operation, result };
  try {
    await db.insert(cmsAuditLogs).values({ ...row, pageId });
  } catch (cause) {
    console.error(
      "[cms-mcp] audit insert failed, retrying unattributed:",
      cause,
    );
    try {
      await db.insert(cmsAuditLogs).values({ ...row, pageId: null });
    } catch (retry) {
      console.error("[cms-mcp] audit insert failed:", retry);
    }
  }
}

function toolError(message: string, details?: unknown) {
  return {
    content: [{ type: "text" as const, text: message }],
    ...structured(details),
    isError: true,
  };
}

/** A successful tool result: the payload as JSON text, plus `structuredContent`
 * only when the payload is something `structuredContent` is allowed to be.
 *
 * Exported for the test that pins this — the array case cannot be reached from
 * `handleCmsMessage` without a database, and it is the case that broke.
 *
 * MCP (`2025-06-18`) types `structuredContent` as a JSON *object*. `list_content`
 * returns a bare array, and setting it unconditionally produced a response that
 * strict clients rejected outright ("expected record, received array") — the
 * whole tool was unusable from them. No tool here advertises an `outputSchema`,
 * so `structuredContent` is a convenience, never the contract: dropping it for
 * a non-object leaves `content[0].text` carrying the same JSON it always did,
 * rather than inventing a wrapper key that the text half would not agree with. */
export function toolSuccess(output: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    ...structured(output),
    isError: false,
  };
}

/** `structuredContent` if `value` is a plain JSON object, nothing otherwise. */
function structured(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { structuredContent: value }
    : {};
}
