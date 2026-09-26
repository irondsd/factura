#!/usr/bin/env bun
/**
 * A command-line client for the LOCAL CMS (the dev server's MCP endpoint), for
 * agents that have no MCP client of their own and for edits that are safer
 * scripted than typed.
 *
 *   bun scripts/cms-local.ts call <tool> '<json>' | @args.json
 *   bun scripts/cms-local.ts upload <image> [collectionId]
 *   bun scripts/cms-local.ts patch <pageId> @ops.json [--dry-run]
 *   bun scripts/cms-local.ts screenshot <url> <out.png> [width] [height]
 *
 * Reads `CMS_LOCAL_URL` and `CMS_LOCAL_TOKEN` from `.env.cms-local` (gitignored).
 * Refuses any endpoint that is not localhost: this never talks to production.
 *
 * ── Why `patch` exists ──────────────────────────────────────────────────────
 * `update_content` takes the whole body. Adding one sentence to a published
 * 15k-character page by re-sending the body means re-typing the page, which is
 * how protected phrases get silently altered. `patch` applies anchored edits
 * to the current body instead, checks every original line survived (except the
 * ones an op explicitly replaces), validates at `level: "publish"`, and saves
 * with the lock version it read.
 *
 * ops.json:
 *   {
 *     "ops": [
 *       { "op": "insert_after", "anchor": "exact unique text", "text": "…" },
 *       { "op": "replace", "anchor": "exact unique text", "text": "…" }
 *     ],
 *     "metadata": { "previewMediaId": "…" },   // merged onto current metadata
 *     "removeFaq": ["exact question text"]      // drops FAQ entries by question
 *   }
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findHeadlessShell } from "./lib/guidePreview";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

function env(): { url: string; token: string } {
  const file = path.join(ROOT, ".env.cms-local");
  if (!existsSync(file)) throw new Error(`${file} is missing.`);
  const vars = Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1).trim(),
      ]),
  );
  const url = vars.CMS_LOCAL_URL ?? "";
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url)) {
    throw new Error(`CMS_LOCAL_URL must be a localhost URL, got "${url}".`);
  }
  return { url, token: vars.CMS_LOCAL_TOKEN ?? "" };
}

type Json = Record<string, unknown>;

async function call(tool: string, args: Json): Promise<unknown> {
  const { url, token } = env();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  let text = await res.text();
  if (text.startsWith("event:") || text.includes("\ndata:")) {
    text = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5))
      .join("");
  }
  const rpc = JSON.parse(text);
  if (rpc.error) throw new Error(`${tool}: ${JSON.stringify(rpc.error)}`);
  const out = (rpc.result.content ?? [])
    .map((c: { text?: string }) => c.text ?? "")
    .join("\n");
  if (rpc.result.isError) throw new Error(`${tool}: ${out}`);
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function readArgs(raw: string | undefined): Json {
  if (!raw) return {};
  return JSON.parse(
    raw.startsWith("@") ? readFileSync(raw.slice(1), "utf8") : raw,
  );
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function upload(file: string, collectionId?: string): Promise<unknown> {
  const contentType = MIME[path.extname(file).toLowerCase()];
  if (!contentType) throw new Error(`Unsupported image type: ${file}`);
  const reserved = (await call("create_media_upload", {
    filename: path.basename(file),
    contentType,
    byteSize: statSync(file).size,
    ...(collectionId ? { collectionId } : {}),
  })) as { mediaId: string; uploadUrl: string };
  // The upload URL is a credential until it expires: never print it.
  if (!/^http:\/\/(localhost|127\.0\.0\.1):9000\//.test(reserved.uploadUrl)) {
    throw new Error("Upload URL is not local MinIO; refusing.");
  }
  const put = await fetch(reserved.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: readFileSync(file),
  });
  if (!put.ok) throw new Error(`PUT failed with ${put.status}.`);
  return call("complete_media_upload", { mediaId: reserved.mediaId });
}

/** Original lines missing from `after`, for the error message. */
function diffLines(before: string, after: string): string[] {
  const kept = new Set(after.split("\n"));
  return before.split("\n").filter((line) => line.trim() && !kept.has(line));
}

type Op = { op: "insert_after" | "replace"; anchor: string; text: string };
type PatchSpec = { ops?: Op[]; metadata?: Json; removeFaq?: string[] };

async function patch(
  id: string,
  spec: PatchSpec,
  dryRun: boolean,
): Promise<void> {
  const current = (await call("get_content", { id })) as {
    lockVersion: number;
    document: {
      slug: string;
      body: string;
      metadata: Json & { faq?: { q: string; a: string }[] };
    };
  };
  const original = current.document.body;
  let body = original;

  // Where each op landed, so it can be undone by position (a deletion leaves
  // no text behind to search for).
  const applied: { at: number; length: number; anchor: string }[] = [];
  for (const { op, anchor, text } of spec.ops ?? []) {
    const count = body.split(anchor).length - 1;
    if (count !== 1)
      throw new Error(
        `Anchor found ${count} times, needs exactly 1: "${anchor.slice(0, 80)}"`,
      );
    const at = body.indexOf(anchor);
    const replacement = op === "replace" ? text : anchor + text;
    body = body.slice(0, at) + replacement + body.slice(at + anchor.length);
    applied.push({ at, length: replacement.length, anchor });
  }

  // Undo every declared op and the original must come back exactly: the only
  // differences an edit can make are the ones it declared.
  let undone = body;
  for (const { at, length, anchor } of applied.reverse()) {
    undone = undone.slice(0, at) + anchor + undone.slice(at + length);
  }
  const lost = undone === original ? [] : diffLines(original, undone);
  if (lost.length)
    throw new Error(`Edit changes text outside its ops:\n${lost.join("\n")}`);

  const metadata = { ...current.document.metadata, ...(spec.metadata ?? {}) };
  if (spec.removeFaq?.length) {
    const before = metadata.faq?.length ?? 0;
    metadata.faq = (metadata.faq ?? []).filter(
      (f) => !spec.removeFaq!.includes(f.q),
    );
    if (before - metadata.faq.length !== spec.removeFaq.length) {
      throw new Error("A removeFaq question did not match exactly.");
    }
  }

  const changes: Json = {};
  if (body !== original) changes.body = body;
  if (JSON.stringify(metadata) !== JSON.stringify(current.document.metadata))
    changes.metadata = metadata;
  if (!Object.keys(changes).length) {
    console.log("No changes.");
    return;
  }

  const validation = (await call("validate_content", {
    id,
    patch: changes,
    level: "publish",
  })) as {
    ok: boolean;
    diagnostics: unknown[];
  };
  console.log(JSON.stringify(validation, null, 2));
  if (!validation.ok) throw new Error("Validation failed; nothing saved.");
  console.log(
    `${current.document.slug}: body ${original.length} → ${body.length} chars`,
  );
  if (dryRun) {
    console.log("Dry run: nothing saved.");
    return;
  }
  await call("update_content", {
    id,
    expectedLockVersion: current.lockVersion,
    patch: changes,
  });
  console.log("Saved.");
}

function screenshot(
  url: string,
  out: string,
  width = "1280",
  height = "900",
): void {
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  execFileSync(findHeadlessShell(), [
    "--disable-gpu",
    "--hide-scrollbars",
    // Vendor apps localise by browser language; readers here are Argentine.
    "--lang=es-AR",
    "--accept-lang=es-AR",
    "--virtual-time-budget=6000",
    `--window-size=${width},${height}`,
    `--screenshot=${path.resolve(out)}`,
    url,
  ]);
  console.log(`Wrote ${out}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "call": {
      const result = await call(rest[0]!, readArgs(rest[1]));
      console.log(
        typeof result === "string" ? result : JSON.stringify(result, null, 2),
      );
      break;
    }
    case "upload":
      console.log(JSON.stringify(await upload(rest[0]!, rest[1]), null, 2));
      break;
    case "patch":
      await patch(
        rest[0]!,
        readArgs(rest[1]) as PatchSpec,
        rest.includes("--dry-run"),
      );
      break;
    case "screenshot":
      screenshot(rest[0]!, rest[1]!, rest[2], rest[3]);
      break;
    default:
      console.log(
        readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0],
      );
      process.exit(1);
  }
}

main().catch((error: Error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
