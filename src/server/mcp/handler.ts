import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  isNotification,
  type JsonRpcMessage,
  type JsonRpcResponse,
  negotiateVersion,
  RPC,
  rpcError,
  rpcResult,
} from "./protocol";
import { callerFor, findTool, TOOLS, toolListing } from "./tools";

/** Method dispatch for the MCP endpoint.
 *
 * Split from the route handler so the protocol can be exercised in tests
 * without an HTTP server, a session or a socket: hand it a message and a user
 * id, get a response back. The route above it does auth, rate limiting and
 * status codes; this does MCP.
 */

/** Server identity, as clients display it. */
const SERVER_INFO = {
  name: "factura",
  title: "Factura",
  // Kept deliberately coarse. This is the MCP surface's version, not the app's:
  // it moves when the tool contract changes, not on every deploy, so clients
  // caching a tool list have something meaningful to compare.
  version: "1.0.0",
} as const;

/** Shown to the model once, at connection. Worth spending words on: it is the
 * difference between an assistant that calls list_properties first and one that
 * guesses at ids. */
const INSTRUCTIONS = `Factura tracks a household's utility bills (electricity, gas, water, internet) across one or more properties.

Call list_properties first — most other tools take a property id, and omitting it covers every property the user can access, which is usually what they mean.

Amounts are in Argentine pesos (ARS) unless a tool says otherwise; inflation there is high enough that comparing pesos across years is misleading, so prefer the USD figures in spending_series and spending_overview for anything spanning more than a few months.

A bill with status 'needs_review' is one the parser could not fully read: its amount or period may be missing. Say so rather than treating a missing amount as zero.

Everything here is read-only. To change or delete a bill, direct the user to the app.`;

export type HandlerContext = { userId: string };

/**
 * Handle one JSON-RPC message.
 *
 * Returns null for a notification — nothing goes back on the wire, and the
 * caller turns that into a 202.
 */
export async function handleMessage(
  message: JsonRpcMessage,
  ctx: HandlerContext,
): Promise<JsonRpcResponse | null> {
  // Notifications are acknowledged by silence. `notifications/initialized` is
  // the one every client sends; the rest (cancellation, progress) are things a
  // stateless server has nothing to do about, and ignoring them is correct
  // rather than merely convenient.
  if (isNotification(message)) return null;

  const id = message.id as string | number;
  const params = message.params ?? {};

  switch (message.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        // Only what is actually implemented. Declaring `resources` or `prompts`
        // here would have clients calling methods that answer with an error.
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });

    case "ping":
      // Liveness check. An empty result is the whole protocol.
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: toolListing() });

    case "tools/call":
      return callTool(id, params, ctx);

    default:
      return rpcError(
        id,
        RPC.METHOD_NOT_FOUND,
        `Unknown method: ${message.method}`,
      );
  }
}

async function callTool(
  id: string | number,
  params: Record<string, unknown>,
  ctx: HandlerContext,
): Promise<JsonRpcResponse> {
  const name = params.name;
  if (typeof name !== "string") {
    return rpcError(id, RPC.INVALID_PARAMS, "Missing tool name.");
  }

  const tool = findTool(name);
  if (!tool) {
    return rpcError(
      id,
      RPC.METHOD_NOT_FOUND,
      `Unknown tool: ${name}. Available: ${TOOLS.map((t) => t.name).join(", ")}`,
    );
  }

  const parsed = tool.schema.safeParse(params.arguments ?? {});
  if (!parsed.success) {
    // A validation failure is the model's mistake, not the protocol's, so it
    // comes back as a tool error it can read and correct rather than as a
    // JSON-RPC error that some clients surface only as a red box.
    return rpcResult(
      id,
      toolError(
        `Invalid arguments for ${name}: ${parsed.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`,
          )
          .join("; ")}`,
      ),
    );
  }

  try {
    const output = await tool.run(callerFor(ctx.userId), parsed.data);
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      isError: false,
    });
  } catch (err) {
    // Anything the router threw becomes a readable tool error. The message is
    // deliberately the router's own where it is safe: tRPC's errors are written
    // for humans and say useful things like "bill not found", while a stack
    // trace or a driver error would leak schema details into a conversation.
    logToolFailure(name, err);
    return rpcResult(id, toolError(describeError(err)));
  }
}

/** tRPC codes that mean "the model asked for something that isn't there, or
 * isn't this account's" — an ordinary outcome of a model working from guessed
 * or stale ids, not a fault. */
const EXPECTED_CODES = new Set([
  "NOT_FOUND",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "BAD_REQUEST",
]);

/**
 * Log a tool failure at the level it deserves.
 *
 * The split matters more than it looks. `get_bill` on an id that does not exist
 * and `get_bill` on an id in someone else's property both surface as NOT_FOUND
 * — the router refuses to distinguish them, which is right, because telling a
 * caller "that bill exists but isn't yours" is an existence oracle. But it
 * means the security-interesting case (a client walking through ids it cannot
 * see) and the boring one (a model mistyped a uuid) arrive here identical.
 *
 * Logging both at `error` with a full stack buries the first in the second and
 * makes an ordinary miss look like a crash — and, once anything is watching the
 * error stream, pages someone for it. So expected codes get one quiet line
 * carrying the tool, the code and the caller, which is enough to notice a
 * hundred of them in a row; only genuine faults get the stack.
 */
function logToolFailure(name: string, err: unknown): void {
  if (err instanceof TRPCError && EXPECTED_CODES.has(err.code)) {
    console.warn(`[mcp] ${name} → ${err.code}`);
    return;
  }
  console.error(`[mcp] tool ${name} failed:`, err);
}

function toolError(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

/** A message safe to put in front of a model. Known error shapes keep their
 * text; anything else is reported generically rather than risking the contents
 * of a driver exception. */
function describeError(err: unknown): string {
  if (err instanceof z.ZodError) return `Invalid arguments: ${err.message}`;
  if (err instanceof TRPCError) {
    // One message for both "no such bill" and "not yours", matching what the
    // router already refuses to distinguish. A model that could tell them apart
    // could enumerate which bill ids exist.
    return err.code === "NOT_FOUND"
      ? "Not found, or not visible to this account."
      : err.message;
  }
  return "The request could not be completed.";
}
