import "server-only";
import { isNotification, type JsonRpcMessage, type JsonRpcResponse, RPC, rpcError, rpcResult } from "@/server/mcp/protocol";
import { CMS_TOOLS, findCmsTool } from "./tools";
import { hasScope, type CmsTokenCaller } from "./tokens";
import { CmsConflictError, CmsValidationError } from "@/cms/server/errors";

export async function handleCmsMessage(message: JsonRpcMessage, caller: CmsTokenCaller): Promise<JsonRpcResponse | null> {
  if (isNotification(message)) return null;
  const id = message.id as string | number;
  if (message.method === "initialize") return rpcResult(id, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "factura-cms", title: "Factura CMS", version: "1.0.0" }, instructions: "Use get_content before update_content. Every mutation requires the current lockVersion. New content is draft; publishing always requires an explicit set_content_status call." });
  if (message.method === "ping") return rpcResult(id, {});
  if (message.method === "tools/list") return rpcResult(id, { tools: CMS_TOOLS.filter((t) => hasScope(caller.scopes, t.scope)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema })) });
  if (message.method !== "tools/call") return rpcError(id, RPC.METHOD_NOT_FOUND, `Unknown method: ${message.method}`);
  const params = message.params ?? {};
  if (typeof params.name !== "string") return rpcError(id, RPC.INVALID_PARAMS, "Missing tool name.");
  const tool = findCmsTool(params.name);
  if (!tool || !hasScope(caller.scopes, tool.scope)) return rpcResult(id, toolError("This token does not have access to that tool."));
  const parsed = tool.schema.safeParse(params.arguments ?? {});
  if (!parsed.success) return rpcResult(id, toolError("Invalid arguments.", { diagnostics: parsed.error.issues }));
  try {
    const output = await tool.run(caller, parsed.data);
    return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], structuredContent: output, isError: false });
  } catch (error) {
    if (error instanceof CmsValidationError) return rpcResult(id, toolError(error.message, { diagnostics: error.diagnostics }));
    if (error instanceof CmsConflictError) return rpcResult(id, toolError(error.message, { actualLockVersion: error.actualLockVersion }));
    return rpcResult(id, toolError(error instanceof Error ? error.message : "CMS operation failed."));
  }
}

function toolError(message: string, details?: unknown) {
  return { content: [{ type: "text" as const, text: message }], ...(details ? { structuredContent: details } : {}), isError: true };
}
