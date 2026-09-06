import "server-only";
import {
  isNotification,
  type JsonRpcMessage,
  type JsonRpcResponse,
  META_SERVER_INFO,
  PROTOCOL_VERSION,
  RPC,
  rpcError,
  rpcResult,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@/server/mcp/protocol";
import { cmsToolListing, findCmsTool } from "./tools";
import { hasScope, type CmsTokenCaller } from "./tokens";
import { CmsValidationError } from "@/cms/server/errors";
import { db } from "@/db";
import { cmsAuditLogs } from "@/db/schema";

/** Self-reported, for display and debugging only — the spec is explicit that
 * clients must not make security decisions from it. The major version tracks
 * the protocol era, so a log line says which shape of server answered. */
const SERVER_INFO = {
  name: "factura-cms",
  title: "Factura CMS",
  version: "2.0.0",
} as const;

const INSTRUCTIONS = [
  "Use get_content before update_content. Every mutation requires the current lockVersion.",
  "Editing is always safe: update_content saves a shared working copy that no reader can see, so a page that is already published keeps serving its last publication while you work. Save it normally, without asking.",
  "set_content_status is the only tool that changes what the public sees, and it needs the human's explicit go-ahead each time, in both directions. 'published' publishes the working copy as a new immutable publication; 'draft' takes the page down.",
  "A page keeps its working copy, a temporary checkpoint, the public preview snapshot, and the current publication plus three previous ones — list_content_versions shows exactly those. restore_content_version copies one back into the working copy without publishing anything.",
  "Categories are section-scoped: the same key in two sections means two independent records. list_categories returns the valid keys to put in page metadata. create_category derives the key and slug from the label; update_category can edit copy and order, and those category settings are live immediately.",
  "Locations are global across every authored section. Call list_locations and put one or more returned keys in metadata.locations before requesting preview or publication. Choose the narrow exact area the page directly covers; use argentina only for genuinely nationwide content, never as an automatic ancestor of a province or city.",
  "This endpoint cannot delete anything: there is no delete tool, and pages are retired by status, not removed. Deleting a category or changing any page or category address is a browser-only action a human performs at /cms; address changes leave redirects behind.",
].join(" ");

/** How long a client may treat a list as fresh.
 *
 * Both of these only change when the app is redeployed, so the honest hint is
 * "minutes, not seconds". Neither list advertises `listChanged`, so the TTL is
 * the only invalidation signal there is: an agent that adopts a tool added in a
 * deploy waits at most this long to see it. */
const DISCOVER_TTL_MS = 3_600_000;
const TOOLS_TTL_MS = 300_000;

/** Wrap a payload as a finished result.
 *
 * `resultType` is required on every result in this revision — `"complete"` here
 * always, since the alternative (`"input_required"`) belongs to the
 * multi-round-trip pattern, and no tool on this server asks the client for
 * anything mid-call. */
function complete<T extends Record<string, unknown>>(payload: T) {
  return {
    resultType: "complete" as const,
    ...payload,
    _meta: { [META_SERVER_INFO]: SERVER_INFO },
  };
}

export async function handleCmsMessage(
  message: JsonRpcMessage,
  caller: CmsTokenCaller,
): Promise<JsonRpcResponse | null> {
  if (isNotification(message)) return null;
  const id = message.id as string | number;

  if (message.method === "server/discover")
    return rpcResult(
      id,
      complete({
        supportedVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        // No `listChanged`: pushing one would mean implementing
        // `subscriptions/listen`, and this list only moves on deploy. `ttlMs`
        // below is the whole freshness story.
        capabilities: { tools: {} },
        instructions: INSTRUCTIONS,
        ttlMs: DISCOVER_TTL_MS,
        // Nothing here varies by caller — same versions, same capabilities,
        // same instructions for every token.
        cacheScope: "public" as const,
      }),
    );

  if (message.method === "tools/list")
    return rpcResult(
      id,
      complete({
        tools: cmsToolListing(caller.scopes),
        ttlMs: TOOLS_TTL_MS,
        // PRIVATE, and not negotiable: this listing is filtered by the calling
        // token's scopes, so a read-only token sees strictly fewer tools than a
        // write token. `"public"` invites a shared proxy to serve one caller's
        // listing to another, which here means handing a read-only agent the
        // names and schemas of every mutation. The scope check in `tools/call`
        // would still refuse the call, but the spec is direct that cacheScope
        // must reflect real visibility rather than lean on that.
        cacheScope: "private" as const,
      }),
    );

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
      complete(toolError("This token does not have access to that tool.")),
    );
  const parsed = tool.schema.safeParse(params.arguments ?? {});
  if (!parsed.success)
    return rpcResult(
      id,
      complete(
        toolError("Invalid arguments.", { diagnostics: parsed.error.issues }),
      ),
    );
  try {
    const output = await tool.run(caller, parsed.data);
    if (tool.scope === "cms:write")
      await audit(
        caller.userId,
        auditTarget(tool.name, parsed.data, output),
        tool.name,
        "ok",
      );
    return rpcResult(id, complete(toolSuccess(output)));
  } catch (error) {
    if (tool.scope === "cms:write")
      await audit(
        caller.userId,
        auditTarget(tool.name, parsed.data),
        tool.name,
        "error",
      );
    if (error instanceof CmsValidationError)
      return rpcResult(
        id,
        complete(toolError(error.message, { diagnostics: error.diagnostics })),
      );
    return rpcResult(
      id,
      complete(
        toolError(
          error instanceof Error ? error.message : "CMS operation failed.",
        ),
      ),
    );
  }
}

/** The diagnostic a client stuck on the `initialize` handshake gets.
 *
 * `2026-07-28` has no `initialize`, so strictly this is just an unknown method.
 * But a legacy client has no way to fall *forward* — it cannot discover that a
 * newer revision exists — so this error text is very likely the only thing its
 * user will ever see about why the server stopped answering. The spec asks a
 * modern-only server to name its versions here for exactly that reason, so the
 * message says what to upgrade to rather than only what went wrong. */
export const legacyInitializeFault = () => ({
  code: RPC.METHOD_NOT_FOUND,
  message: `This server speaks MCP ${PROTOCOL_VERSION} only, which has no 'initialize' handshake. Supported protocol versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")}. Upgrade the client to one that sends per-request '_meta' metadata.`,
});

function pageId(input: unknown): string | null {
  return typeof input === "object" &&
    input !== null &&
    "id" in input &&
    typeof input.id === "string"
    ? input.id
    : null;
}

type AuditTarget = {
  pageId: string | null;
  resourceType: string | null;
  resourceId: string | null;
};

function auditTarget(
  operation: string,
  input: unknown,
  output?: unknown,
): AuditTarget {
  const id = pageId(input) ?? pageId(output);
  if (operation.endsWith("_category"))
    return { pageId: null, resourceType: "category", resourceId: id };
  if (operation.endsWith("_location"))
    return { pageId: null, resourceType: "location", resourceId: id };
  return { pageId: id, resourceType: null, resourceId: null };
}
/** Record who did what, without ever being the reason a request fails.
 *
 * `page_id` is a real foreign key, and the id in a failed mutation is very
 * often one that does not exist — a stale id, or a typo from an agent, which is
 * the ordinary case this endpoint has to survive. That insert then violates the
 * constraint, and an exception thrown while *reporting* an error replaced a
 * handled tool failure with an unhandled one: the route's dispatch rejected and
 * the client got an HTML 500 in place of a JSON-RPC response.
 *
 * So the reference is dropped rather than the record: a second attempt with no
 * `page_id` still says who tried what and how it ended, which is what the trail
 * is for. If even that fails the audit is lost and logged — accountability for
 * an internal tool is not worth failing the operation over. */
async function audit(
  actorId: string,
  target: AuditTarget,
  operation: string,
  result: string,
) {
  const row = { actorId, operation, result, ...target };
  try {
    await db.insert(cmsAuditLogs).values(row);
  } catch (cause) {
    console.error(
      "[cms-mcp] audit insert failed, retrying unattributed:",
      cause,
    );
    try {
      await db
        .insert(cmsAuditLogs)
        .values({ ...row, pageId: null, resourceId: null });
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
 * when the payload is something worth repeating in structured form.
 *
 * Exported for the test that pins this — the array case cannot be reached from
 * `handleCmsMessage` without a database, and it is the case that once broke.
 *
 * History worth keeping: MCP `2025-06-18` typed `structuredContent` as a JSON
 * *object*, and `list_content` returns a bare array, so setting it
 * unconditionally produced a response strict clients rejected outright
 * ("expected record, received array") — the whole tool was unusable from them.
 * `2026-07-28` loosened the field to any JSON value, so arrays are legal again
 * and `list_content` gets structured output back.
 *
 * Primitives are still skipped. No tool here advertises an `outputSchema`, so
 * `structuredContent` is a convenience rather than a contract, and
 * `structuredContent: 42` next to a `content[0].text` of "42" tells a client
 * nothing it did not already have. */
export function toolSuccess(output: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    ...structured(output),
    isError: false,
  };
}

/** `structuredContent` if `value` is a JSON object or array, nothing otherwise. */
function structured(value: unknown) {
  return typeof value === "object" && value !== null
    ? { structuredContent: value }
    : {};
}
