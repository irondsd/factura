import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseMessage } from "@/server/mcp/protocol";
import { limitKey, MCP_CALL, take } from "@/server/rateLimit";
import { createTestDb, hasTestDatabase } from "@/cms/server/testDb";
import { handleCmsMessage, toolSuccess } from "./handler";
import {
  CMS_SCOPES,
  type CmsScope,
  type CmsTokenCaller,
  hasScope,
  hashCmsToken,
  mintCmsToken,
  resolveCmsToken,
} from "./tokens";
import { cmsToolListing, findCmsTool } from "./tools";

// Phase 8's missing gate: "Add protocol, auth, scope, role, validation,
// conflict, rate-limit, and mutation tests."
//
// This is the only internet-exposed, write-capable surface in the CMS, and it
// reaches the same service the browser does — so what is tested here is not the
// content rules (they have their own suites) but the things only this path can
// get wrong: who the bearer resolves to, what a token's scopes let it call, and
// whether a refusal happens before the tool runs.
//
// The protocol half needs no database and runs in CI. The token half writes
// rows, so it runs under `bun run test:db` like the other integration suites.

const caller = (scopes: readonly CmsScope[]): CmsTokenCaller => ({
  userId: "11111111-1111-1111-1111-111111111111",
  email: null,
  name: null,
  role: "editor",
  source: "mcp",
  tokenId: "22222222-2222-2222-2222-222222222222",
  scopes: [...scopes],
});

const request = (method: string, params?: Record<string, unknown>) => {
  const parsed = parseMessage({ jsonrpc: "2.0", id: 1, method, params });
  if (!parsed.ok)
    throw new Error(`test message is malformed: ${parsed.reason}`);
  return parsed.message;
};

/** The tool result shape, which the handler returns inside a JSON-RPC result
 * rather than as a protocol error — an MCP tool failure is data for the model,
 * not a transport fault. */
type ToolResult = {
  content: { type: string; text: string }[];
  structuredContent?: unknown;
  isError: boolean;
};

const resultOf = (response: unknown): ToolResult =>
  (response as { result: ToolResult }).result;

describe("token shape", () => {
  it("mints a prefixed token and stores only its hash", () => {
    const { token, hash } = mintCmsToken();
    expect(token.startsWith("fct_cms_")).toBe(true);
    expect(hash).toBe(hashCmsToken(token));
    expect(hash).not.toContain(token.slice("fct_cms_".length));
  });

  it("mints a different token every time", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => mintCmsToken().token),
    );
    expect(tokens.size).toBe(50);
  });

  it("knows which scopes a token carries", () => {
    expect(hasScope(["cms:read"], "cms:read")).toBe(true);
    expect(hasScope(["cms:read"], "cms:write")).toBe(false);
  });
});

describe("tool listing", () => {
  it("shows a read-only token only the read tools", () => {
    const names = cmsToolListing(["cms:read"]).map((tool) => tool.name);
    expect(names).toEqual([
      "list_content",
      "get_content",
      "list_categories",
      "list_authors",
      "list_locations",
      "get_location",
      "get_category",
      "validate_content",
      "list_content_versions",
      "get_content_version",
      "compare_content_version",
      "list_media",
      "get_media",
    ]);
  });

  it("shows a write token the mutations as well", () => {
    const names = cmsToolListing(CMS_SCOPES).map((tool) => tool.name);
    expect(names).toContain("create_content");
    expect(names).toContain("update_content");
    expect(names).toContain("set_content_status");
    expect(names).toContain("restore_content_version");
    expect(names).toContain("discard_content_wip");
    expect(names).toContain("create_media_upload");
    expect(names).toContain("complete_media_upload");
    expect(names).toContain("update_media");
    expect(names).toContain("create_category");
    expect(names).toContain("update_category");
  });

  it("offers no way to delete anything, content or media", () => {
    // The server's real guarantee is the tool list itself: removal is a
    // browser-only action a person performs at /cms, and an agent that wants an
    // image gone leaves it unused for a human to review. An annotation is a
    // hint; an absent tool is a fact.
    const names = cmsToolListing(CMS_SCOPES).map((tool) => tool.name);
    expect(
      names.filter((name) => /delete|remove|trash|purge/.test(name)),
    ).toEqual([]);
  });

  it("does not let an agent choose or change a category slug", () => {
    const create = findCmsTool("create_category");
    const update = findCmsTool("update_category");
    expect(
      create?.schema.safeParse({
        section: "guias",
        label: "Prueba",
        title: "Prueba",
        description: "Prueba",
        slug: "elegido-por-el-agente",
      }).success,
    ).toBe(false);
    expect(
      update?.schema.safeParse({
        id: "33333333-3333-3333-3333-333333333333",
        expectedLockVersion: 1,
        patch: { slug: "cambiado-por-el-agente" },
      }).success,
    ).toBe(false);
    expect(findCmsTool("rename_category")).toBeUndefined();
    expect(findCmsTool("delete_category")).toBeUndefined();
  });

  it("gives every tool an input schema", () => {
    for (const tool of cmsToolListing(CMS_SCOPES)) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
  });

  it("exposes no tool that deletes content", () => {
    // Deletion is a browser-only action (`contentService.delete`). An agent
    // holding a full-scope token must not be able to reach it, so the listing
    // is the assertion: a future tool named for removal fails here first.
    for (const tool of cmsToolListing(CMS_SCOPES)) {
      expect(tool.name).not.toMatch(/delete|remove|destroy|archive/);
    }
    for (const name of ["delete_content", "remove_content"]) {
      expect(findCmsTool(name)).toBeUndefined();
    }
  });

  it("marks the publication switch and the discard destructive, and nothing else", () => {
    // The annotation is what tells a client which call needs a human first, so
    // the set has to be small enough to still mean something. Two qualify:
    // `set_content_status` changes what readers see, and `discard_content_wip`
    // throws away editorial work with nothing behind it.
    //
    // Saving is not destructive, and this is the assertion that keeps it that
    // way: `update_content` writes a private working copy the public cannot
    // reach, and flagging it would train an agent to ask before every save and
    // then click through the prompt that actually matters. Restoring is not
    // either — it overwrites the working copy, but the copy it overwrites is
    // kept as the checkpoint.
    const destructive = cmsToolListing(CMS_SCOPES)
      .filter((tool) => tool.annotations.destructiveHint)
      .map((tool) => tool.name);
    expect(destructive).toEqual(["set_content_status", "discard_content_wip"]);
  });

  it("marks every read tool read-only and every mutation not", () => {
    for (const tool of cmsToolListing(CMS_SCOPES)) {
      expect(tool.annotations.readOnlyHint).toBe(
        findCmsTool(tool.name)?.scope === "cms:read",
      );
    }
  });

  it("declares every mutation under cms:write", () => {
    // The scope is what the handler checks, so a mutation mislabelled `cms:read`
    // would be callable by a read-only token.
    for (const name of [
      "create_content",
      "update_content",
      "set_content_status",
    ]) {
      expect(findCmsTool(name)?.scope).toBe("cms:write");
    }
  });
});

describe("rate limiting", () => {
  // The bucket mechanics have their own suite (`src/server/rateLimit.test.ts`).
  // What is specific to this endpoint is that its bucket is a *separate* one:
  // an agent hammering the CMS must not spend the budget of the read-only
  // Factura MCP, and vice versa.
  const from = (ip: string) =>
    new Request("https://factura.uno/api/cms/mcp", {
      headers: { "x-forwarded-for": ip },
    });

  it("keys the CMS endpoint apart from the ordinary MCP one", () => {
    const request = from("203.0.113.10");
    expect(limitKey(request, "cms:mcp")).not.toBe(limitKey(request, "mcp"));
  });

  it("does not spend the other endpoint's budget", () => {
    const request = from("203.0.113.11");
    const cms = limitKey(request, "cms:mcp");
    const ordinary = limitKey(request, "mcp");

    for (let i = 0; i < MCP_CALL.capacity; i++) take(cms, MCP_CALL);
    expect(take(cms, MCP_CALL).ok).toBe(false);
    expect(take(ordinary, MCP_CALL).ok).toBe(true);
  });

  it("keys separate callers apart", () => {
    expect(limitKey(from("203.0.113.12"), "cms:mcp")).not.toBe(
      limitKey(from("203.0.113.13"), "cms:mcp"),
    );
  });
});

describe("protocol", () => {
  it("answers initialize with a protocol version and instructions", async () => {
    const response = await handleCmsMessage(
      request("initialize"),
      caller(["cms:read"]),
    );
    expect(response).toMatchObject({
      id: 1,
      result: { serverInfo: { name: "factura-cms" } },
    });
  });

  it("answers ping", async () => {
    const response = await handleCmsMessage(
      request("ping"),
      caller(["cms:read"]),
    );
    expect(response).toMatchObject({ result: {} });
  });

  it("refuses an unknown method as a protocol error", async () => {
    const response = await handleCmsMessage(
      request("resources/list"),
      caller(["cms:read"]),
    );
    expect(response).toMatchObject({ error: { code: -32601 } });
  });

  it("returns nothing for a notification", async () => {
    const parsed = parseMessage({ jsonrpc: "2.0", method: "notifications/x" });
    if (!parsed.ok) throw new Error("bad fixture");
    expect(await handleCmsMessage(parsed.message, caller(["cms:read"]))).toBe(
      null,
    );
  });

  it("refuses a tools/call with no tool name", async () => {
    const response = await handleCmsMessage(
      request("tools/call", {}),
      caller(["cms:read"]),
    );
    expect(response).toMatchObject({ error: { code: -32602 } });
  });
});

describe("tool result envelope", () => {
  // `structuredContent` is typed as a JSON object by the spec. `list_content`
  // returns a bare array, and sending it as `structuredContent` made strict
  // clients reject the whole response ("expected record, received array") —
  // the tool was uncallable from them, on every call, regardless of arguments.
  it("omits structuredContent for an array payload", () => {
    const result = toolSuccess([{ id: "a" }, { id: "b" }]);
    expect(result).not.toHaveProperty("structuredContent");
  });

  it("still carries an array payload as JSON text", () => {
    // The text half is what every client reads, so dropping the structured
    // half must not drop the data.
    const rows = [{ id: "a" }, { id: "b" }];
    expect(JSON.parse(toolSuccess(rows).content[0].text)).toEqual(rows);
  });

  it("keeps structuredContent for an object payload", () => {
    const page = { id: "a", lockVersion: 1 };
    expect(toolSuccess(page).structuredContent).toEqual(page);
  });

  it("never sets structuredContent to a non-object", () => {
    for (const payload of [[], "text", 3, true, null, undefined]) {
      const result = toolSuccess(payload) as { structuredContent?: unknown };
      if ("structuredContent" in result) {
        expect(Array.isArray(result.structuredContent), String(payload)).toBe(
          false,
        );
        expect(typeof result.structuredContent, String(payload)).toBe("object");
      }
    }
  });
});

describe("scope enforcement", () => {
  const call = (
    name: string,
    args: Record<string, unknown>,
    scopes: readonly CmsScope[],
  ) =>
    handleCmsMessage(
      request("tools/call", { name, arguments: args }),
      caller(scopes),
    );

  it("refuses a mutation from a read-only token", async () => {
    const response = await call(
      "set_content_status",
      {
        id: "33333333-3333-3333-3333-333333333333",
        status: "published",
        expectedLockVersion: 1,
      },
      ["cms:read"],
    );
    expect(resultOf(response)).toMatchObject({ isError: true });
    expect(resultOf(response).content[0].text).toMatch(/does not have access/);
  });

  it("refuses every mutation from a read-only token", async () => {
    for (const name of [
      "create_content",
      "update_content",
      "set_content_status",
    ]) {
      const response = await call(name, {}, ["cms:read"]);
      expect(resultOf(response).isError, name).toBe(true);
    }
  });

  it("refuses a read from a token with no scopes at all", async () => {
    const response = await call("get_content", {}, []);
    expect(resultOf(response).isError).toBe(true);
  });

  it("gives an unknown tool the same answer as an unpermitted one", async () => {
    // Same wording on purpose: a token should not be able to map the tool
    // surface it was not granted.
    const unknown = await call("delete_everything", {}, ["cms:read"]);
    const unpermitted = await call("create_content", {}, ["cms:read"]);
    expect(resultOf(unknown).content[0].text).toBe(
      resultOf(unpermitted).content[0].text,
    );
  });

  it("rejects bad arguments before the tool runs", async () => {
    // `id` is not a UUID, so this never reaches the service — which is what
    // keeps a malformed call from being a database round trip.
    const response = await call("get_content", { id: "not-a-uuid" }, [
      "cms:read",
    ]);
    expect(resultOf(response)).toMatchObject({ isError: true });
    expect(resultOf(response).content[0].text).toBe("Invalid arguments.");
  });

  it("rejects an update with no lock version", async () => {
    const response = await call(
      "update_content",
      { id: "33333333-3333-3333-3333-333333333333", patch: { title: "x" } },
      CMS_SCOPES,
    );
    expect(resultOf(response)).toMatchObject({ isError: true });
    expect(resultOf(response).content[0].text).toBe("Invalid arguments.");
  });
});

// ── the database half ───────────────────────────────────────────────────────

const TOKEN_NAME = "zz-cms-mcp-test";

if (!hasTestDatabase()) {
  describe.skip("CMS MCP tokens against PostgreSQL", () => {
    it("needs a local database — run `bun run test:db`", () => {});
  });
} else {
  describe("CMS MCP tokens against PostgreSQL", () => {
    const { db, client } = createTestDb();
    const schema = db._.fullSchema;

    /** A member and a non-member, both pre-existing. This suite never creates
     * or deletes an account or a membership — it only mints tokens, which it
     * names and cleans up itself. */
    let memberId = "";
    let strangerId: string | null = null;

    const mint = async (input: {
      userId: string;
      scopes: CmsScope[];
      expiresAt?: Date | null;
      revoked?: boolean;
    }) => {
      const { token, hash } = mintCmsToken();
      await db.insert(schema.cmsApiTokens).values({
        userId: input.userId,
        name: TOKEN_NAME,
        tokenHash: hash,
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
        revokedAt: input.revoked ? new Date() : null,
      });
      return token;
    };

    beforeEach(async () => {
      await db
        .delete(schema.cmsApiTokens)
        .where(eq(schema.cmsApiTokens.name, TOKEN_NAME));

      const member = await db.query.cmsMembers.findFirst({
        columns: { userId: true },
      });
      if (!member) {
        throw new Error("local database has no cms_member row to test with");
      }
      memberId = member.userId;

      const stranger = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .leftJoin(
          schema.cmsMembers,
          eq(schema.cmsMembers.userId, schema.users.id),
        )
        .where(isNull(schema.cmsMembers.userId))
        .limit(1);
      strangerId = stranger[0]?.id ?? null;
    });

    afterAll(async () => {
      await db
        .delete(schema.cmsApiTokens)
        .where(eq(schema.cmsApiTokens.name, TOKEN_NAME));
      await client.end();
    });

    it("resolves a live token to its holder and role", async () => {
      const token = await mint({ userId: memberId, scopes: ["cms:read"] });
      const resolved = await resolveCmsToken(token, db);
      expect(resolved).toMatchObject({
        userId: memberId,
        scopes: ["cms:read"],
      });
      expect(resolved?.role).toMatch(/admin|editor/);
    });

    it("refuses a token that was never minted", async () => {
      expect(await resolveCmsToken("fct_cms_nope", db)).toBeNull();
    });

    it("refuses anything without the CMS prefix", async () => {
      // An ordinary Factura API token must not be usable here even if it
      // somehow collided — the prefix check happens before the lookup.
      expect(await resolveCmsToken("fct_live_whatever", db)).toBeNull();
    });

    it("refuses a revoked token", async () => {
      const token = await mint({
        userId: memberId,
        scopes: ["cms:read"],
        revoked: true,
      });
      expect(await resolveCmsToken(token, db)).toBeNull();
    });

    it("refuses an expired token", async () => {
      const token = await mint({
        userId: memberId,
        scopes: ["cms:read"],
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await resolveCmsToken(token, db)).toBeNull();
    });

    it("accepts a token whose expiry is still ahead", async () => {
      const token = await mint({
        userId: memberId,
        scopes: ["cms:read"],
        expiresAt: new Date(Date.now() + 86400000),
      });
      expect(await resolveCmsToken(token, db)).not.toBeNull();
    });

    it("refuses a token whose holder is not a CMS member", async () => {
      // The rule that makes membership the real grant: removing someone from
      // `cms_member` has to bite on the next request, without anyone having to
      // remember to revoke their tokens too.
      if (!strangerId) return; // no non-member account locally; nothing to assert
      const token = await mint({ userId: strangerId, scopes: ["cms:read"] });
      expect(await resolveCmsToken(token, db)).toBeNull();
    });

    it("drops a scope the build does not know", async () => {
      const token = await mint({
        userId: memberId,
        scopes: ["cms:read", "cms:root" as CmsScope],
      });
      const resolved = await resolveCmsToken(token, db);
      expect(resolved?.scopes).toEqual(["cms:read"]);
    });

    it("records when a token was last used", async () => {
      const token = await mint({ userId: memberId, scopes: ["cms:read"] });
      await resolveCmsToken(token, db);
      const row = await db.query.cmsApiTokens.findFirst({
        where: and(
          eq(schema.cmsApiTokens.name, TOKEN_NAME),
          eq(schema.cmsApiTokens.tokenHash, hashCmsToken(token)),
        ),
      });
      expect(row?.lastUsedAt).not.toBeNull();
    });

    it("never stores the token itself", async () => {
      const token = await mint({ userId: memberId, scopes: ["cms:read"] });
      const rows = await db
        .select()
        .from(schema.cmsApiTokens)
        .where(like(schema.cmsApiTokens.name, TOKEN_NAME));
      expect(JSON.stringify(rows)).not.toContain(token);
    });
  });

  describe("CMS MCP mutations against PostgreSQL", () => {
    // Driven through `handleCmsMessage` rather than the service, because the
    // point is the path an agent actually takes: argument parsing, the shared
    // service, the structured error shape, and the audit row.
    const { db, client } = createTestDb();
    const schema = db._.fullSchema;
    const SLUG = "zz-cms-mcp-";

    let agent: CmsTokenCaller;
    /** Audit rows that already existed when this test started.
     *
     * Identified by id rather than by timestamp. The local database holds real
     * rows from earlier manual verification, so a suite that cleared the table
     * to get a clean slate would be eating data it did not create — and a
     * timestamp watermark taken from the host clock is not comparable with
     * `now()` from the database's, which are milliseconds apart in either
     * direction and made these assertions flaky. */
    let baseline: Set<string>;

    const call = (name: string, args: Record<string, unknown>) =>
      handleCmsMessage(request("tools/call", { name, arguments: args }), agent);

    /** Pointers, then revisions, then pages — the order the `restrict` foreign
     * keys allow. See the note on the same helper in
     * `contentService.integration.test.ts`. */
    const cleanup = async () => {
      const mine = like(schema.cmsPages.slug, `${SLUG}%`);
      await db
        .update(schema.cmsPages)
        .set({
          publishedRevisionId: null,
          previewRevisionId: null,
          wipRevisionId: null,
          checkpointRevisionId: null,
        })
        .where(mine);
      await db
        .delete(schema.cmsPageRevisions)
        .where(
          inArray(
            schema.cmsPageRevisions.pageId,
            db
              .select({ id: schema.cmsPages.id })
              .from(schema.cmsPages)
              .where(mine),
          ),
        );
      await db.delete(schema.cmsPages).where(mine);
      await db
        .delete(schema.cmsCategories)
        .where(like(schema.cmsCategories.key, `${SLUG}%`));
    };

    /** The document a page currently stores, read straight from the revision
     * the CMS pointer selects. These assertions are about what landed in the
     * database, so they read the revision rather than trusting the tool's own
     * answer about it. */
    const storedDocument = async (id: string) => {
      const page = await db.query.cmsPages.findFirst({
        where: eq(schema.cmsPages.id, id),
      });
      const revisionId =
        page?.wipRevisionId ??
        page?.publishedRevisionId ??
        page?.previewRevisionId;
      return revisionId
        ? db.query.cmsPageRevisions.findFirst({
            where: eq(schema.cmsPageRevisions.id, revisionId),
          })
        : undefined;
    };

    const auditRows = () =>
      db
        .select()
        .from(schema.cmsAuditLogs)
        .where(eq(schema.cmsAuditLogs.actorId, agent.userId));

    /** Only the rows this test produced. Individual assertions narrow further
     * by page, since a count over the whole run would depend on what every
     * other test in the file had done first. */
    const auditTrail = async () =>
      (await auditRows()).filter((row) => !baseline.has(row.id));

    beforeEach(async () => {
      await cleanup();
      const member = await db.query.cmsMembers.findFirst();
      if (!member) {
        throw new Error("local database has no cms_member row to test with");
      }
      agent = {
        userId: member.userId,
        email: null,
        name: null,
        role: member.role,
        source: "mcp",
        tokenId: "22222222-2222-2222-2222-222222222222",
        scopes: [...CMS_SCOPES],
      };
      baseline = new Set((await auditRows()).map((row) => row.id));
    });

    afterAll(async () => {
      await cleanup();
      await client.end();
    });

    const newPage = (slug: string) => ({
      section: "guias",
      slug: `${SLUG}${slug}`,
      title: "Página del agente",
      description: "Descripción de prueba para la suite MCP del CMS.",
      summary: "Resumen de prueba.",
      cta: "Probá Factura.",
      body: "## Sección\n\nTexto.\n",
      metadata: { keywords: ["prueba"], categories: ["servicios"] },
    });

    const created = (response: unknown) =>
      resultOf(response).structuredContent as {
        id: string;
        lockVersion: number;
      };

    it("creates a draft and never anything else", async () => {
      // cms.md: an agent cannot publish by creating. Publication is always a
      // second, explicit call that passes the publish gate.
      const response = await call("create_content", newPage("create"));
      expect(resultOf(response).isError).toBe(false);
      expect(created(response)).toMatchObject({ status: "draft" });
    });

    it("refuses a create whose metadata is the wrong shape", async () => {
      // A draft only needs metadata that can be read back safely. Category
      // membership is checked at preview/publish, so an unknown *string* key
      // is valid here; this fixture must actually violate the schema shape.
      const response = await call("create_content", {
        ...newPage("bad-meta"),
        metadata: { keywords: ["x"], categories: "no-such-category" },
      });
      expect(resultOf(response).isError).toBe(true);
    });

    it("updates against the current lock version", async () => {
      const page = created(await call("create_content", newPage("update")));
      const response = await call("update_content", {
        id: page.id,
        expectedLockVersion: page.lockVersion,
        patch: { title: "Título nuevo" },
      });
      // `update_content` saves the shared working copy, so it answers with the
      // copy it wrote rather than with a bare document: an agent needs to know
      // its edit landed in the draft and not on the live page.
      expect(resultOf(response).structuredContent).toMatchObject({
        created: false,
        document: {
          title: "Título nuevo",
          lockVersion: page.lockVersion + 1,
        },
      });
    });

    it("reports a stale update as a conflict rather than overwriting", async () => {
      const page = created(await call("create_content", newPage("conflict")));
      await call("update_content", {
        id: page.id,
        expectedLockVersion: page.lockVersion,
        patch: { title: "Primero" },
      });
      const stale = await call("update_content", {
        id: page.id,
        expectedLockVersion: page.lockVersion,
        patch: { title: "Segundo" },
      });

      expect(resultOf(stale).isError).toBe(true);
      expect(resultOf(stale).content[0].text).toMatch(/changed since/);

      expect((await storedDocument(page.id))?.title).toBe("Primero");
    });

    it("returns validation diagnostics structurally, not as prose", async () => {
      // cms.md: "Tools return structured validation diagnostics, not only
      // prose." A model needs the field and the code, not a sentence.
      const page = created(
        await call("create_content", newPage("diagnostics")),
      );
      const response = await call("update_content", {
        id: page.id,
        expectedLockVersion: page.lockVersion,
        patch: { body: "import x from 'y'\n\n## Hola\n" },
      });

      expect(resultOf(response).isError).toBe(true);
      const details = resultOf(response).structuredContent as {
        diagnostics: { code: string }[];
      };
      expect(details.diagnostics.map((d) => d.code)).toContain(
        "mdx.esm-forbidden",
      );
    });

    it("validates without writing", async () => {
      const page = created(await call("create_content", newPage("validate")));
      const response = await call("validate_content", {
        id: page.id,
        patch: { body: "{expression}\n" },
        level: "draft",
      });

      expect(resultOf(response).isError).toBe(false);
      expect((await storedDocument(page.id))?.bodyMdx).toBe(
        newPage("validate").body,
      );
    });

    it("saves the working copy without touching what the public reads", async () => {
      // The property an agent has to be able to rely on, because the server's
      // instructions now tell it that editing a published page is safe and
      // needs no permission (cms.md).
      const page = created(await call("create_content", newPage("wip-safe")));
      await call("set_content_status", {
        id: page.id,
        status: "published",
        expectedLockVersion: page.lockVersion,
      });
      const live = (
        await db.query.cmsPages.findFirst({
          where: eq(schema.cmsPages.id, page.id),
        })
      )?.publishedRevisionId;

      const state = resultOf(await call("get_content", { id: page.id }))
        .structuredContent as { lockVersion: number };
      await call("update_content", {
        id: page.id,
        expectedLockVersion: state.lockVersion,
        patch: { body: "## Sección\n\nBorrador del agente.\n" },
      });

      const after = await db.query.cmsPages.findFirst({
        where: eq(schema.cmsPages.id, page.id),
      });
      expect(after?.publishedRevisionId).toBe(live);
      expect(after?.status).toBe("published");
      expect((await storedDocument(page.id))?.kind).toBe("wip");
    });

    it("reports the lifecycle, not only the document", async () => {
      const page = created(await call("create_content", newPage("state")));
      const state = resultOf(await call("get_content", { id: page.id }))
        .structuredContent as Record<string, unknown>;

      expect(state).toMatchObject({
        status: "draft",
        hasWip: true,
        publishedRevisionId: null,
        previewIsStale: false,
        publicationCount: 0,
      });
      expect(state.document).toMatchObject({ id: page.id });
    });

    it("lists exactly the versions that exist, and no more", async () => {
      const page = created(await call("create_content", newPage("versions")));
      await call("set_content_status", {
        id: page.id,
        status: "published",
        expectedLockVersion: page.lockVersion,
      });

      const listed = resultOf(
        await call("list_content_versions", { id: page.id }),
      ).structuredContent as {
        versions: { kind: string; isLive: boolean }[];
        baselineIsLive: boolean;
      };
      expect(listed.versions).toHaveLength(1);
      expect(listed.versions[0]).toMatchObject({
        kind: "published",
        isLive: true,
      });
      expect(listed.baselineIsLive).toBe(true);
    });

    it("restores a publication into the working copy without publishing it", async () => {
      const page = created(await call("create_content", newPage("restore")));
      await call("set_content_status", {
        id: page.id,
        status: "published",
        expectedLockVersion: page.lockVersion,
      });
      const before = await db.query.cmsPages.findFirst({
        where: eq(schema.cmsPages.id, page.id),
      });

      const listed = resultOf(
        await call("list_content_versions", { id: page.id }),
      ).structuredContent as { versions: { revisionId: string }[] };
      const state = resultOf(await call("get_content", { id: page.id }))
        .structuredContent as { lockVersion: number };

      const response = await call("restore_content_version", {
        id: page.id,
        revisionId: listed.versions[0].revisionId,
        expectedLockVersion: state.lockVersion,
      });
      expect(resultOf(response).isError).toBe(false);

      const after = await db.query.cmsPages.findFirst({
        where: eq(schema.cmsPages.id, page.id),
      });
      // A working copy appeared; the live publication did not move.
      expect(after?.wipRevisionId).not.toBeNull();
      expect(after?.publishedRevisionId).toBe(before?.publishedRevisionId);
      expect(after?.status).toBe("published");
    });

    it("refuses a revision that belongs to another page", async () => {
      // Indistinguishable from "no such revision": an id from another page must
      // not be confirmed as real by the error it produces.
      const mine = created(await call("create_content", newPage("mine")));
      const theirs = created(await call("create_content", newPage("theirs")));
      const theirVersions = resultOf(
        await call("list_content_versions", { id: theirs.id }),
      ).structuredContent as { versions: { revisionId: string }[] };

      const response = await call("get_content_version", {
        id: mine.id,
        revisionId: theirVersions.versions[0].revisionId,
      });
      expect(resultOf(response).isError).toBe(true);
    });

    it("compares the working copy against the live publication", async () => {
      const page = created(await call("create_content", newPage("compare")));
      await call("set_content_status", {
        id: page.id,
        status: "published",
        expectedLockVersion: page.lockVersion,
      });
      const state = resultOf(await call("get_content", { id: page.id }))
        .structuredContent as { lockVersion: number };
      await call("update_content", {
        id: page.id,
        expectedLockVersion: state.lockVersion,
        patch: { title: "Un título distinto" },
      });

      const comparison = resultOf(
        await call("compare_content_version", { id: page.id }),
      ).structuredContent as {
        baseline: { isLive: boolean } | null;
        candidate: { kind: string };
        diff: { fields: { field: string }[]; identical: boolean } | null;
      };
      expect(comparison.baseline?.isLive).toBe(true);
      expect(comparison.candidate.kind).toBe("wip");
      expect(comparison.diff?.identical).toBe(false);
      expect(comparison.diff?.fields.map((f) => f.field)).toContain("title");
    });

    it("discards the working copy and leaves the published page alone", async () => {
      const page = created(await call("create_content", newPage("discard")));
      await call("set_content_status", {
        id: page.id,
        status: "published",
        expectedLockVersion: page.lockVersion,
      });
      let state = resultOf(await call("get_content", { id: page.id }))
        .structuredContent as { lockVersion: number };
      await call("update_content", {
        id: page.id,
        expectedLockVersion: state.lockVersion,
        patch: { body: "## Sección\n\nDescartable.\n" },
      });
      state = resultOf(await call("get_content", { id: page.id }))
        .structuredContent as { lockVersion: number };

      const response = await call("discard_content_wip", {
        id: page.id,
        expectedLockVersion: state.lockVersion,
      });
      expect(resultOf(response).isError).toBe(false);

      const after = await db.query.cmsPages.findFirst({
        where: eq(schema.cmsPages.id, page.id),
      });
      expect(after?.wipRevisionId).toBeNull();
      expect(after?.status).toBe("published");
      expect(after?.publishedRevisionId).not.toBeNull();
    });

    it("puts an agent's publish through the same gate a person's goes through", async () => {
      // No keywords, which the document validator treats as an error at publish
      // level. The agent gets exactly the refusal an editor would.
      const page = created(
        await call("create_content", {
          ...newPage("publish"),
          metadata: { keywords: [], categories: [] },
        }),
      );
      const response = await call("set_content_status", {
        id: page.id,
        status: "published",
        expectedLockVersion: page.lockVersion,
      });

      expect(resultOf(response).isError).toBe(true);
      const details = resultOf(response).structuredContent as {
        diagnostics: { field?: string }[];
      };
      expect(details.diagnostics.some((d) => d.field === "keywords")).toBe(
        true,
      );

      const row = await db.query.cmsPages.findFirst({
        where: eq(schema.cmsPages.id, page.id),
      });
      expect(row?.status).toBe("draft");
    });

    it("audits a mutation without recording the body", async () => {
      const page = created(await call("create_content", newPage("audit")));
      const rows = (await auditTrail()).filter((r) => r.pageId === page.id);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        operation: "create_content",
        result: "ok",
      });
      // cms.md: log the actor, page, operation, result and timestamp — never
      // a token value or a content body.
      expect(JSON.stringify(rows[0])).not.toContain("Texto.");
      expect(Object.keys(rows[0]).sort()).toEqual([
        "actorId",
        "createdAt",
        "id",
        "operation",
        "pageId",
        "resourceId",
        "resourceType",
        "result",
      ]);
    });

    it("lets an agent create and edit category copy, but not its slug", async () => {
      const response = await call("create_category", {
        section: "noticias",
        label: "zz cms mcp categoria",
        title: "Categoría creada por un agente",
        description: "Categoría temporal para probar el transporte MCP.",
      });
      expect(resultOf(response).isError).toBe(false);
      const category = resultOf(response).structuredContent as {
        id: string;
        key: string;
        slug: string;
        lockVersion: number;
      };
      expect(category).toMatchObject({
        key: "zz-cms-mcp-categoria",
        slug: "zz-cms-mcp-categoria",
      });

      const updated = await call("update_category", {
        id: category.id,
        expectedLockVersion: category.lockVersion,
        patch: { label: "Categoría editada por un agente" },
      });
      expect(resultOf(updated).structuredContent).toMatchObject({
        id: category.id,
        slug: "zz-cms-mcp-categoria",
        label: "Categoría editada por un agente",
      });

      const listed = resultOf(
        await call("list_categories", { section: "noticias" }),
      );
      expect(JSON.parse(listed.content[0].text)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: category.id,
            slug: "zz-cms-mcp-categoria",
          }),
        ]),
      );
    });

    it("attributes category mutations without treating the category id as a page id", async () => {
      const category = resultOf(
        await call("create_category", {
          section: "noticias",
          label: "zz cms mcp audit",
          title: "Categoría temporal de auditoría",
          description: "Categoría temporal para verificar la auditoría MCP.",
        }),
      ).structuredContent as { id: string };

      const rows = (await auditTrail()).filter(
        (row) => row.resourceId === category.id,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        pageId: null,
        resourceType: "category",
        resourceId: category.id,
        operation: "create_category",
        result: "ok",
      });
    });

    it("audits a failed mutation too", async () => {
      const page = created(await call("create_content", newPage("audit-fail")));
      await call("update_content", {
        id: page.id,
        expectedLockVersion: page.lockVersion + 99,
        patch: { title: "x" },
      });
      const rows = (await auditTrail()).filter((r) => r.pageId === page.id);
      expect(rows.map((r) => r.result)).toEqual(["ok", "error"]);
    });

    it("survives a mutation against a page id that does not exist", async () => {
      // The audit row references `cms_page` by foreign key, and a wrong or
      // stale id is the ordinary agent mistake. Recording it used to violate
      // that constraint *inside the error handler*, which turned a handled tool
      // failure into an unhandled one and the response into an HTML 500.
      const absent = "33333333-3333-4333-8333-333333333333";
      const response = await call("update_content", {
        id: absent,
        expectedLockVersion: 1,
        patch: { title: "x" },
      });

      expect(resultOf(response).isError).toBe(true);
      expect(resultOf(response).content[0].text).toMatch(/not found/i);

      // Still audited, just not attributed to a page that never existed —
      // which is also why this cannot filter on `pageId === null`:
      // `cleanup()` hard-deletes this suite's pages between tests and
      // `page_id` is `on delete set null`, so earlier rows go null too.
      const added = await auditTrail();
      expect(added).toHaveLength(1);
      expect(added[0]).toMatchObject({
        operation: "update_content",
        result: "error",
        pageId: null,
      });
    });

    it("answers list_content with an object-shaped structuredContent or none", async () => {
      // The real path, against real rows: whatever the service returns, the
      // envelope has to stay something a strict MCP client will accept.
      await call("create_content", newPage("list-shape"));
      const result = resultOf(await call("list_content", { section: "guias" }));

      expect(result.isError).toBe(false);
      expect(Array.isArray(result.structuredContent)).toBe(false);
      if (result.structuredContent !== undefined)
        expect(typeof result.structuredContent).toBe("object");

      // And the listing itself still arrives, in the text content.
      const rows = JSON.parse(result.content[0].text) as { slug: string }[];
      expect(rows.some((row) => row.slug === `${SLUG}list-shape`)).toBe(true);
    });

    it("does not audit a read", async () => {
      const before = (await auditTrail()).length;
      await call("list_content", { section: "guias" });
      await call("get_content", {
        id: created(await call("create_content", newPage("read-audit"))).id,
      });
      // One row, for the create — neither read added anything.
      expect((await auditTrail()).length).toBe(before + 1);
    });
  });
}
