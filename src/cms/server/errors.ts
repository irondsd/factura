import type { Diagnostic } from "@/content-system/types";

// The failures a CMS write can have, as types rather than strings. Both the
// browser service and the MCP tools have to distinguish them — a conflict is
// recoverable by reloading, a validation failure is recoverable by editing, and
// a missing page is neither — and cms.md §8 requires the MCP to return
// structured diagnostics rather than prose.

/** The page moved under the editor. Carries the version actually in the
 * database so the caller can offer "reload" without a second round trip. */
export class CmsConflictError extends Error {
  readonly code = "conflict" as const;
  constructor(
    readonly pageId: string,
    readonly expectedLockVersion: number,
    readonly actualLockVersion: number | null,
  ) {
    super(
      `Page ${pageId} changed since you loaded it (you have version ${expectedLockVersion}, the database has ${actualLockVersion ?? "no such page"}).`,
    );
    this.name = "CmsConflictError";
  }
}

export class CmsNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "CmsNotFoundError";
  }
}

/** The write was refused because the content did not meet the level its
 * destination requires. The diagnostics are the point — never flatten them into
 * the message. */
export class CmsValidationError extends Error {
  readonly code = "invalid" as const;
  constructor(readonly diagnostics: Diagnostic[]) {
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    super(
      `Content did not validate (${errors} error${errors === 1 ? "" : "s"}).`,
    );
    this.name = "CmsValidationError";
  }
}

/** The actor may be a CMS member but not for this operation — publishing when
 * publication is admin-only, minting a token as an editor. */
export class CmsForbiddenError extends Error {
  readonly code = "forbidden" as const;
  /** `what` is a Spanish verb phrase — these messages reach an editor. */
  constructor(what: string) {
    super(`No tienes permiso para ${what}.`);
    this.name = "CmsForbiddenError";
  }
}

/** A slug collision. Separate from a validation error because the fix is
 * different: pick another slug, rather than edit the content. */
export class CmsSlugTakenError extends Error {
  readonly code = "slug_taken" as const;
  constructor(section: string, slug: string) {
    super(`Ya existe una página en /${section}/${slug}. Elige otra dirección.`);
    this.name = "CmsSlugTakenError";
  }
}
