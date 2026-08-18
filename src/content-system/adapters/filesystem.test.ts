import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateContentCollection } from "../validation";
import {
  assetExists,
  declaredImports,
  documentsFromFilesystem,
  stripImports,
} from "./filesystem";

// The Phase 4 gate, against the real corpus: "Existing guides receive
// equivalent or stricter validation under the new pure validator."
//
// This is the test that would catch a rule tightened by accident — every guide
// in the repository has to keep validating clean, through the same pure
// functions the CMS will use on database rows.

describe("documentsFromFilesystem", () => {
  const documents = documentsFromFilesystem("guias");

  it("reads every guide", () => {
    expect(documents.length).toBeGreaterThanOrEqual(43);
  });

  it("gives every guide the fields the database needs", () => {
    for (const document of documents) {
      expect(document.slug, document.id).toMatch(/^[a-z0-9-]+$/);
      expect(document.title.length, document.id).toBeGreaterThan(0);
      expect(document.description.length, document.id).toBeGreaterThan(0);
      expect(document.summary.length, document.id).toBeGreaterThan(0);
      expect(document.cta.length, document.id).toBeGreaterThan(0);
      expect(document.publishedAt, document.id).toBeTruthy();
    }
  });

  it("maps meta.noindex onto the preview status", () => {
    // Nothing sets it today, so every guide imports as published — recorded in
    // the Phase 0 inventory and asserted here so a new draft guide changes this
    // test rather than silently importing as public.
    expect(documents.every((d) => d.status === "published")).toBe(true);
  });

  it("leaves no import statements in any body", () => {
    // The grammar layer rejects them, so a body that kept one could not be
    // published. This is the check that the stripping actually happened.
    for (const document of documents) {
      expect(declaredImports(document.body), document.id).toEqual([]);
    }
  });

  it("only ever strips the InflacionChart import", () => {
    // Phase 7 must "reject any unexpected import". This reads the untouched
    // sources and enumerates every specifier actually present, so that phase
    // knows exactly what the allowlist has to contain — and so a guide adding a
    // new import fails here rather than having it silently deleted.
    const dir = path.join(process.cwd(), "src/content/guias");
    const specifiers = new Set(
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".mdx"))
        .flatMap((f) =>
          declaredImports(fs.readFileSync(path.join(dir, f), "utf8")),
        ),
    );
    expect([...specifiers]).toEqual(["@/components/guides/InflacionChart"]);
  });

  it("leaves no meta block in any body", () => {
    for (const document of documents) {
      expect(/export\s+const\s+meta\s*=/.test(document.body), document.id).toBe(
        false,
      );
    }
  });

  it("validates every guide clean through the pure validator", () => {
    const findings = validateContentCollection(documents, { assetExists });
    const problems = [...findings.entries()]
      .filter(([, diagnostics]) => diagnostics.length > 0)
      .map(
        ([key, diagnostics]) =>
          `${key}: ${diagnostics.map((d) => d.message).join("; ")}`,
      );
    expect(problems).toEqual([]);
  });
});

describe("stripImports", () => {
  it("removes a whole import statement", () => {
    expect(
      stripImports('import { X } from "@/components/X";\n\nTexto.\n'),
    ).toBe("\nTexto.\n");
  });

  it("leaves prose that merely starts with the word import", () => {
    // The regex requires the `from "…"` that makes a line an import statement.
    const prose = "Importante: import no es una palabra reservada aquí.\n";
    expect(stripImports(prose)).toBe(prose);
  });

  it("reports what it would strip", () => {
    expect(
      declaredImports(
        'import { InflacionChart } from "@/components/guides/InflacionChart";\n',
      ),
    ).toEqual(["@/components/guides/InflacionChart"]);
  });
});
