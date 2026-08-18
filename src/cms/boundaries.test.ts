import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// `src/cms` is meant to be lifted into the public-site deployment as one unit
// (cms.md §2.2/§13.8), which only stays true if nothing in it reaches into the
// bill app. That is a rule no reviewer will reliably catch by eye once the
// module has thirty files, so it is a test.
//
// Checked by reading the source rather than by importing it: an import graph
// built at runtime would need every CMS module to load, and the server-only
// ones can't in a test process.

const CMS_DIR = path.join(process.cwd(), "src/cms");

/** Import specifiers `src/cms` may not use, with the reason each is out of
 * bounds. Prefix match on the module path, so `@/components/app/AppShell` is
 * caught by `@/components/app`. */
const FORBIDDEN: { prefix: string; why: string }[] = [
  { prefix: "@/components/app", why: "bill-app UI" },
  { prefix: "@/server/root", why: "tRPC app router" },
  { prefix: "@/server/trpc", why: "tRPC app router" },
  { prefix: "@/server/ingest", why: "bill domain" },
  { prefix: "@/server/parsers", why: "parser domain" },
  { prefix: "@/server/parserSchema", why: "parser domain" },
  { prefix: "@/server/reparse", why: "parser domain" },
  { prefix: "@/server/registry", why: "parser domain" },
  { prefix: "@/server/ownership", why: "property/bill authorization" },
  { prefix: "@/server/storage", why: "private bill storage" },
  { prefix: "@/server/pdf", why: "bill domain" },
  { prefix: "@/lib/trpc", why: "tRPC client" },
  { prefix: "@/lib/insights", why: "bill domain" },
  { prefix: "@/lib/forecast", why: "bill domain" },
];

function cmsSourceFiles(dir = CMS_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cmsSourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every module specifier a file imports, from static imports, `export … from`
 * and dynamic `import()`. */
function importsOf(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  const specifiers: string[] = [];
  const pattern = /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]);
  return specifiers;
}

describe("src/cms module boundaries", () => {
  const files = cmsSourceFiles();

  it("has source files to check", () => {
    // Guards the guard: a rename that empties the directory would otherwise
    // make every assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(0);
  });

  it("never imports bill-app UI or app-domain server code", () => {
    const violations = files.flatMap((file) =>
      importsOf(file)
        .filter((spec) =>
          FORBIDDEN.some(
            (f) => spec === f.prefix || spec.startsWith(`${f.prefix}/`),
          ),
        )
        .map((spec) => `${path.relative(CMS_DIR, file)} → ${spec}`),
    );
    expect(violations).toEqual([]);
  });

  it("never reaches the app by relative path either", () => {
    // `../../components/app/...` is the same violation spelled differently, and
    // the alias check above would wave it through.
    const violations = files.flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec.startsWith("."))
        .map((spec) => path.resolve(path.dirname(file), spec))
        .filter(
          (resolved) =>
            resolved.includes(path.join("src", "components", "app")) ||
            resolved.includes(path.join("src", "app")),
        )
        .map((resolved) => `${path.relative(CMS_DIR, file)} → ${resolved}`),
    );
    expect(violations).toEqual([]);
  });

  it("keeps src/content-system free of CMS imports", () => {
    // The other direction of the same boundary: the shared content system is
    // used by the public site, so it must not depend on the private CMS.
    const dir = path.join(process.cwd(), "src/content-system");
    if (!fs.existsSync(dir)) return; // arrives in Phase 2
    const violations = cmsSourceFiles(dir).flatMap((file) =>
      importsOf(file)
        .filter((spec) => spec === "@/cms" || spec.startsWith("@/cms/"))
        .map((spec) => `${path.relative(dir, file)} → ${spec}`),
    );
    expect(violations).toEqual([]);
  });
});

// cms.md §2 and Phase 2: "Ensure callers outside repository/service modules do
// not query `cms_pages` directly." Two modules may — the public repository and
// the CMS store — and everything else goes through them, so the lifecycle rules
// cannot be bypassed by a route that writes its own `where` clause.
describe("cms_page access", () => {
  const ALLOWED = [
    path.join("src", "content-system", "repository", "postgres.ts"),
    path.join("src", "content-system", "repository", "mapping.ts"),
    path.join("src", "cms", "server", "store.ts"),
    // The schema defines the table; the seed and test helpers may reference it.
    path.join("src", "db", "schema.ts"),
  ];

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === "node_modules") return [];
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  it("actually finds the modules that do query it", () => {
    // Guards the guard: if the identifier is ever renamed, the check below
    // would find nothing and pass for the wrong reason.
    const users = ALLOWED.filter((rel) =>
      /\bcmsPages\b/.test(
        fs.readFileSync(path.join(process.cwd(), rel), "utf8"),
      ),
    );
    expect(users).toContain(path.join("src", "cms", "server", "store.ts"));
    expect(users).toContain(
      path.join("src", "content-system", "repository", "postgres.ts"),
    );
  });

  it("is confined to the repository and the CMS store", () => {
    const root = path.join(process.cwd(), "src");
    const offenders = sourceFiles(root)
      .map((file) => path.relative(process.cwd(), file))
      .filter((rel) => !ALLOWED.includes(rel))
      .filter((rel) => !rel.endsWith(".test.ts") && !rel.endsWith(".test.tsx"))
      .filter((rel) =>
        /\bcmsPages\b/.test(
          fs.readFileSync(path.join(process.cwd(), rel), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
