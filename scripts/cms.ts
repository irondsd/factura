#!/usr/bin/env bun
/**
 * A command-line client for the CMS's MCP endpoint, for agents that have no
 * MCP client of their own and for edits that are safer scripted than typed.
 *
 *   bun scripts/cms.ts call <tool> '<json>' | @args.json
 *   bun scripts/cms.ts upload <image> [collectionId]
 *   bun scripts/cms.ts patch <pageId> @ops.json [--dry-run]
 *   bun scripts/cms.ts transfer <localPageId> [--dry-run]   (local → prod)
 *   bun scripts/cms.ts screenshot <url> <out.png> [width] [height]
 *   bun scripts/cms.ts text <url> [out.txt]   (rendered text of a JS page)
 *
 * `CMS_TARGET` picks the CMS that `call`, `upload` and `patch` talk to:
 *
 *   local (default)  `CMS_LOCAL_URL` and `CMS_LOCAL_TOKEN` from `.env.cms-local`;
 *                    the URL must be localhost.
 *   prod             `CMS_PROD_TOKEN` from `.env.cms-prod`, always against
 *                    https://factura.uno/api/cms/mcp. Mint a token for it at
 *                    /cms/tokens; never reuse one found in another file.
 *
 * Both files are gitignored. `transfer` reads both. On prod the client refuses
 * `set_content_status`: publishing and unpublishing stay a human decision, made
 * at /cms or through an MCP client that asks first.
 *
 * ── Why `transfer` exists ───────────────────────────────────────────────────
 * Writing in the local CMS costs no Neon egress; validation and the editor
 * read whole sections. `transfer` then copies one finished page to prod: it
 * uploads the library images the page uses (once, remembered in
 * `.work/cms-transfer/media-map.json`), rewrites their permalinks and
 * `previewMediaId` / `provider.logoMediaId`, and creates the page as a prod
 * draft, or saves a working copy on the prod page with the same section and
 * slug. It never publishes. Categories, locations and authors must already
 * exist on prod; the validation it prints says so when they don't.
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findHeadlessShell } from "./lib/guidePreview";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

type Target = "local" | "prod";

const PROD_URL = "https://factura.uno/api/cms/mcp";

// Where each target's presigned media uploads may point.
const UPLOAD_HOST: Record<Target, RegExp> = {
  local: /^http:\/\/(localhost|127\.0\.0\.1):9000\//,
  prod: /^https:\/\/[a-z0-9]+\.r2\.cloudflarestorage\.com\//,
};

function currentTarget(): Target {
  const target = process.env.CMS_TARGET ?? "local";
  if (target !== "local" && target !== "prod") {
    throw new Error(`CMS_TARGET must be "local" or "prod", got "${target}".`);
  }
  return target;
}

function readEnvFile(name: string): Record<string, string> {
  const file = path.join(ROOT, name);
  if (!existsSync(file)) throw new Error(`${file} is missing.`);
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1).trim(),
      ]),
  );
}

function env(target: Target): { url: string; token: string } {
  if (target === "prod") {
    const token = readEnvFile(".env.cms-prod").CMS_PROD_TOKEN ?? "";
    if (!token) throw new Error(".env.cms-prod has no CMS_PROD_TOKEN.");
    return { url: PROD_URL, token };
  }
  const vars = readEnvFile(".env.cms-local");
  const url = vars.CMS_LOCAL_URL ?? "";
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url)) {
    throw new Error(`CMS_LOCAL_URL must be a localhost URL, got "${url}".`);
  }
  return { url, token: vars.CMS_LOCAL_TOKEN ?? "" };
}

type Json = Record<string, unknown>;

async function call(
  tool: string,
  args: Json,
  target: Target = currentTarget(),
): Promise<unknown> {
  if (target === "prod" && tool === "set_content_status") {
    throw new Error(
      "set_content_status is refused on prod: a person publishes at /cms.",
    );
  }
  const { url, token } = env(target);
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

type MediaAsset = {
  id: string;
  permalink: string;
  src: string;
  originalFilename: string;
  mimeType: string;
  collectionId: string | null;
  defaultAlt: string;
  decorative: boolean;
  attribution: string | null;
  lockVersion: number;
};

async function uploadBytes(
  bytes: ArrayBuffer,
  filename: string,
  contentType: string,
  collectionId: string | null | undefined,
  target: Target,
): Promise<MediaAsset> {
  const reserved = (await call(
    "create_media_upload",
    {
      filename,
      contentType,
      byteSize: bytes.byteLength,
      ...(collectionId ? { collectionId } : {}),
    },
    target,
  )) as { mediaId: string; uploadUrl: string };
  // The upload URL is a credential until it expires: never print it.
  if (!UPLOAD_HOST[target].test(reserved.uploadUrl)) {
    throw new Error(`Upload URL is not ${target} media storage; refusing.`);
  }
  const put = await fetch(reserved.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes,
  });
  if (!put.ok) throw new Error(`PUT failed with ${put.status}.`);
  return (await call(
    "complete_media_upload",
    { mediaId: reserved.mediaId },
    target,
  )) as MediaAsset;
}

async function upload(file: string, collectionId?: string): Promise<unknown> {
  const contentType = MIME[path.extname(file).toLowerCase()];
  if (!contentType) throw new Error(`Unsupported image type: ${file}`);
  return uploadBytes(
    new Uint8Array(readFileSync(file)).buffer,
    path.basename(file),
    contentType,
    collectionId,
    currentTarget(),
  );
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

type PageDocument = {
  id: string;
  section: string;
  slug: string;
  status: string;
  title: string;
  titleTag: string | null;
  description: string;
  summary: string;
  cta: string;
  canonicalSlug: string | null;
  parentId: string | null;
  sortOrder: number;
  crumb: string | null;
  body: string;
  metadata: Json & {
    previewMediaId?: string;
    provider?: Json & { logoMediaId?: string };
  };
};
type Page = { lockVersion: number; document: PageDocument };

const MEDIA_MAP = path.join(ROOT, ".work", "cms-transfer", "media-map.json");
const MEDIA_PATH = /\/media\/([0-9a-f-]{36})\/[^\s)"'\]]+/g;

type MediaMap = Record<string, { id: string; permalink: string }>;

function loadMediaMap(): MediaMap {
  return existsSync(MEDIA_MAP)
    ? JSON.parse(readFileSync(MEDIA_MAP, "utf8"))
    : {};
}

function saveMediaMap(map: MediaMap): void {
  mkdirSync(path.dirname(MEDIA_MAP), { recursive: true });
  writeFileSync(MEDIA_MAP, JSON.stringify(map, null, 2) + "\n");
}

/** The prod page at this section and slug, if there is one. */
async function findProdPage(
  section: string,
  slug: string,
): Promise<{ id: string; status: string } | undefined> {
  const rows = (await call(
    "list_content",
    { section, search: slug },
    "prod",
  )) as { id: string; slug: string; status: string }[];
  return rows.find((row) => row.slug === slug);
}

/**
 * Copies one local page to prod as a draft, or as a working copy on the prod
 * page with the same section and slug. Images go first, so the page is never
 * saved pointing at local media.
 */
async function transfer(localId: string, dryRun: boolean): Promise<void> {
  const local = ((await call("get_content", { id: localId }, "local")) as Page)
    .document;
  console.log(`local ${local.section}/${local.slug} (${local.status})`);

  // A child's parent is a different row on prod: find it by its slug.
  let parentId: string | null = null;
  if (local.parentId) {
    const parent = (
      (await call("get_content", { id: local.parentId }, "local")) as Page
    ).document;
    const prodParent = await findProdPage(parent.section, parent.slug);
    if (!prodParent) {
      throw new Error(
        `Parent ${parent.section}/${parent.slug} is not on prod: transfer it first.`,
      );
    }
    parentId = prodParent.id;
  }

  const mediaIds = new Set(
    [...local.body.matchAll(MEDIA_PATH)].map((match) => match[1]!),
  );
  if (local.metadata.previewMediaId)
    mediaIds.add(local.metadata.previewMediaId);
  if (local.metadata.provider?.logoMediaId) {
    mediaIds.add(local.metadata.provider.logoMediaId);
  }

  const map = loadMediaMap();
  const pending = [...mediaIds].filter((id) => !map[id]);
  console.log(
    `images: ${mediaIds.size} (${mediaIds.size - pending.length} already on prod)`,
  );
  const existing = await findProdPage(local.section, local.slug);
  console.log(
    existing
      ? `prod: updates ${existing.id} (${existing.status}); a working copy, never a publish`
      : "prod: creates a new draft",
  );
  if (dryRun) {
    for (const id of pending) console.log(`  would upload ${id}`);
    console.log("Dry run: nothing uploaded or saved.");
    return;
  }

  for (const id of pending) {
    const { asset } = (await call("get_media", { id }, "local")) as {
      asset: MediaAsset;
    };
    const res = await fetch(asset.src);
    if (!res.ok)
      throw new Error(`Download of ${id} failed with ${res.status}.`);
    const copy = await uploadBytes(
      await res.arrayBuffer(),
      asset.originalFilename,
      asset.mimeType,
      asset.collectionId,
      "prod",
    );
    if (asset.defaultAlt || asset.decorative || asset.attribution) {
      await call(
        "update_media",
        {
          id: copy.id,
          expectedLockVersion: copy.lockVersion,
          patch: {
            defaultAlt: asset.defaultAlt,
            decorative: asset.decorative,
            attribution: asset.attribution,
          },
        },
        "prod",
      );
    }
    map[id] = { id: copy.id, permalink: copy.permalink };
    // Saved after each image, so a failed run resumes instead of re-uploading.
    saveMediaMap(map);
    console.log(`  uploaded ${id} → ${copy.id}`);
  }

  const body = local.body.replace(
    MEDIA_PATH,
    (whole, id: string) => map[id]?.permalink ?? whole,
  );
  const metadata: PageDocument["metadata"] = { ...local.metadata };
  if (metadata.previewMediaId) {
    metadata.previewMediaId = map[metadata.previewMediaId]!.id;
  }
  if (metadata.provider?.logoMediaId) {
    metadata.provider = {
      ...metadata.provider,
      logoMediaId: map[metadata.provider.logoMediaId]!.id,
    };
  }
  const fields = {
    title: local.title,
    titleTag: local.titleTag,
    description: local.description,
    summary: local.summary,
    cta: local.cta,
    canonicalSlug: local.canonicalSlug,
    sortOrder: local.sortOrder,
    crumb: local.crumb,
    body,
    metadata,
  };

  let prodId: string;
  if (existing) {
    const current = (await call(
      "get_content",
      { id: existing.id },
      "prod",
    )) as Page;
    // metadata merges on update: keys only prod has are removed, so the
    // working copy matches the local page exactly.
    const removed = Object.fromEntries(
      Object.keys(current.document.metadata)
        .filter((key) => !(key in metadata))
        .map((key) => [key, null]),
    );
    await call(
      "update_content",
      {
        id: existing.id,
        expectedLockVersion: current.lockVersion,
        patch: { ...fields, metadata: { ...metadata, ...removed } },
      },
      "prod",
    );
    prodId = existing.id;
  } else {
    const created = (await call(
      "create_content",
      { section: local.section, slug: local.slug, parentId, ...fields },
      "prod",
    )) as Page | { id: string };
    prodId = "document" in created ? created.document.id : created.id;
  }

  const validation = (await call(
    "validate_content",
    { id: prodId, level: "publish" },
    "prod",
  )) as { ok: boolean; diagnostics: unknown[] };
  console.log(JSON.stringify(validation, null, 2));
  console.log(`Saved on prod: ${prodId}. Nothing was published.`);
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

// The visible text of a page after its scripts run, for sources that curl
// only sees as an empty JavaScript shell. A throwaway headless profile: no
// cookies, no saved logins, nothing clicked. The DOM comes back as HTML, so
// the text is recovered here with a deliberately plain tag stripper.
function pageText(url: string, out?: string): void {
  const html = execFileSync(
    findHeadlessShell(),
    [
      "--disable-gpu",
      "--lang=es-AR",
      "--accept-lang=es-AR",
      "--virtual-time-budget=8000",
      "--dump-dom",
      url,
    ],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
      // Chrome logs WebRTC and GPU chatter to stderr on every page.
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  const text = html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer)>/gi, "\n")
    .replace(/<(td|th)\b[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === "#") {
        const n =
          code[1] === "x" || code[1] === "X"
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : match;
      }
      return entities[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (out) {
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, text + "\n");
    console.log(`Wrote ${out} (${text.length} chars)`);
  } else {
    console.log(text);
  }
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
    case "transfer":
      await transfer(rest[0]!, rest.includes("--dry-run"));
      break;
    case "screenshot":
      screenshot(rest[0]!, rest[1]!, rest[2], rest[3]);
      break;
    case "text":
      pageText(rest[0]!, rest[1]);
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
