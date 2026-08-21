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

/** The page exists and the actor may edit it, but it is not in a state where
 * deleting it is allowed: it is not a draft, or other pages hang off it.
 *
 * Its own class rather than a forbidden or a validation error, because neither
 * fits — no role would change the answer, and nothing about the page's *content*
 * is wrong. The fix is to move the page (unpublish it, re-parent its children)
 * and try again, which is what the message says. */
export class CmsNotDeletableError extends Error {
  readonly code = "not_deletable" as const;
  /** Spanish: these messages reach an editor. */
  constructor(why: string) {
    super(why);
    this.name = "CmsNotDeletableError";
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

/** A media asset cannot be trashed because pages still point at it.
 *
 * Its own class, like `CmsNotDeletableError`: no role changes the answer and
 * nothing about the asset is invalid — the fix is to edit the pages listed in
 * `usage`, which is why they travel with the error rather than being fetched
 * again by whoever displays it. */
export class CmsMediaInUseError extends Error {
  readonly code = "media_in_use" as const;
  constructor(
    readonly usage: { section: string; slug: string; title: string }[],
  ) {
    super(
      `Esta imagen se usa en ${usage.length} página${usage.length === 1 ? "" : "s"}. Quítala de ahí antes de moverla a la papelera.`,
    );
    this.name = "CmsMediaInUseError";
  }
}

/** The media library has no storage configured. Distinct from every other
 * failure because nothing an editor does will fix it — it is a deployment
 * setting — so the message names the missing variables instead of suggesting a
 * retry. */
export class CmsMediaUnavailableError extends Error {
  readonly code = "media_unavailable" as const;
  constructor(why: string) {
    super(why);
    this.name = "CmsMediaUnavailableError";
  }
}

/** There is no saved working copy to act on: publish, promote or discard was
 * asked for on a page whose last save has already been consumed.
 *
 * Its own class rather than a validation error because nothing is wrong with
 * the content — there is none. The browser never sends it (the buttons are
 * disabled), so the case that reaches here is an agent acting on a stale read,
 * and the message says what to do about that. */
export class CmsNoWorkingCopyError extends Error {
  readonly code = "no_working_copy" as const;
  constructor(what: string) {
    super(`No hay borrador guardado para ${what}. Guarda un cambio primero.`);
    this.name = "CmsNoWorkingCopyError";
  }
}

/** A revision id that does not belong to the page it was asked for, or is not
 * a kind that may be restored or shown. Deliberately indistinguishable from
 * "no such revision": an id from another page must not be confirmed as real. */
export class CmsRevisionNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor() {
    super("Esa versión no existe para esta página.");
    this.name = "CmsRevisionNotFoundError";
  }
}
