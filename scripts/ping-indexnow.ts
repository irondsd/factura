#!/usr/bin/env bun
/**
 * Submits URLs to IndexNow, by hand, after something has been published.
 *
 * IndexNow is a push protocol: instead of waiting for a crawler to come back and
 * notice a change, you POST the list of URLs and the engines fetch them. Bing,
 * Yandex, Seznam and Naver share one endpoint, so a single call reaches all of
 * them. Google does not participate — this changes nothing there.
 *
 * The reason it's worth having anyway is Bing: its index is what ChatGPT search
 * reads from, so this is the shortest path between "a statistics page picked up
 * a new month" and "an assistant can cite it". Hours instead of weeks.
 *
 * ── Run it AFTER deploying ──────────────────────────────────────────────────
 * This reads the *live* sitemap, not a local build, and that ordering is the
 * whole contract: IndexNow means "this URL changed, come fetch it", so a URL
 * submitted before it is live sends the crawler to a 404 or to the old copy.
 * Deploy first, then run this.
 *
 * Run: `bun run indexnow`                    — every URL in the live sitemap
 *      `bun run indexnow /guias/nueva-guia`  — only the pages you just added
 *      `bun run indexnow --dry-run`          — print the payload, send nothing
 *
 * Naming a few paths is the better habit once the site is established: the
 * protocol asks for the URLs that *changed*, and re-submitting eighty unchanged
 * ones on every publish is how a host earns a rate limit. The no-argument form
 * is there for the first submission and for a bulk re-announce.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { siteUrl } from "../src/config/urls";
import { bold, dim, green, red, yellow } from "./lib/content";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const HOST = new URL(siteUrl).host;

/** Resolved from this file rather than `process.cwd()`, so the script runs the
 * same from anywhere — the same rule `CONTENT_DIR` follows. */
const PUBLIC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);

type Key = { key: string; keyLocation: string };

/** The IndexNow key, read from the key file rather than hardcoded.
 *
 * The protocol's own verification rule is that `<key>.txt` at the site root
 * contains exactly the key, so the filename and the contents already have to
 * agree — deriving the key from the file that proves it means there is only one
 * place to change it, and a mismatch is caught here instead of by a rejected
 * submission. */
function readKey(): Key | null {
  for (const file of readdirSync(PUBLIC_DIR)) {
    if (!/^[0-9a-f]{8,128}\.txt$/i.test(file)) continue;
    const key = path.basename(file, ".txt");
    const body = readFileSync(path.join(PUBLIC_DIR, file), "utf8").trim();
    if (body === key) return { key, keyLocation: `${siteUrl}/${file}` };
  }
  return null;
}

/** Every `<loc>` in the live sitemap.
 *
 * The sitemap also carries `xhtml:link` hreflang alternates for the /en pages,
 * but those are attributes rather than `<loc>` elements, so they're excluded by
 * construction — IndexNow wants one entry per URL, and an alternate is
 * described by its entry rather than being one. */
async function liveSitemapUrls(): Promise<string[]> {
  const res = await fetch(`${siteUrl}/sitemap.xml`);
  if (!res.ok) {
    throw new Error(`GET ${siteUrl}/sitemap.xml → ${res.status}`);
  }
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].trim(),
  );
  if (urls.length === 0) throw new Error("live sitemap has no <loc> entries");
  return [...new Set(urls)];
}

/** Turn an argument into an absolute URL on this site. Accepts "/guias/x" or
 * the full "https://factura.uno/guias/x", and rejects anything on another
 * origin — IndexNow refuses a batch whose URLs don't all belong to `host`, and
 * it refuses the whole batch rather than the stray entry. */
function toSiteUrl(arg: string): string {
  const url = arg.startsWith("http")
    ? arg
    : `${siteUrl}${arg.startsWith("/") ? "" : "/"}${arg}`;
  if (!url.startsWith(siteUrl)) {
    throw new Error(`${arg} is not on ${siteUrl}`);
  }
  return url;
}

/** Confirm each URL actually resolves before announcing it.
 *
 * Only worth doing for hand-typed arguments: a URL out of the live sitemap is
 * already known to exist, whereas a mistyped slug submitted here is a crawl
 * budget spent on a 404 and a small mark against the host. */
async function checkLive(urls: string[]): Promise<string[]> {
  const dead: string[] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "manual" });
        if (res.status !== 200) dead.push(`${url} → ${res.status}`);
      } catch {
        dead.push(`${url} → unreachable`);
      }
    }),
  );
  return dead;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const paths = args.filter((a) => !a.startsWith("--"));

  const keyInfo = readKey();
  if (!keyInfo) {
    console.error(red(`No IndexNow key file in public/.`));
    console.error(
      dim(`  Expected a <key>.txt whose contents are exactly <key>.`),
    );
    return 1;
  }

  let urlList: string[];
  if (paths.length > 0) {
    urlList = [...new Set(paths.map(toSiteUrl))];
    const dead = await checkLive(urlList);
    if (dead.length > 0) {
      console.error(red(`These URLs are not live — deploy first:`));
      for (const d of dead) console.error(`  ${d}`);
      return 1;
    }
  } else {
    urlList = await liveSitemapUrls();
  }

  console.log(
    `${bold("IndexNow")} ${dim(`· ${HOST} · key ${keyInfo.key}`)}\n` +
      `${urlList.length} URL${urlList.length === 1 ? "" : "s"}` +
      dim(paths.length > 0 ? " (named)" : " (from the live sitemap)"),
  );
  for (const url of urlList) console.log(dim(`  ${url}`));

  if (dryRun) {
    console.log(yellow(`\nDry run — nothing sent.`));
    return 0;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, ...keyInfo, urlList }),
  });

  // 200 accepted; 202 accepted but the key is still being verified.
  if (res.ok) {
    console.log(green(`\nSubmitted ${urlList.length} URLs (${res.status}).`));
    return 0;
  }
  console.error(red(`\nEndpoint returned ${res.status} ${res.statusText}.`));
  console.error(dim(`  ${(await res.text()).slice(0, 300)}`));
  return 1;
}

process.exit(
  await main().catch((err: unknown) => {
    console.error(red(err instanceof Error ? err.message : String(err)));
    return 1;
  }),
);
