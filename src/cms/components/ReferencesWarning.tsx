"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pageReferencesAction } from "@/cms/server/actions";
import type { PageReferences } from "@/cms/server/contentService";
import { cmsEditPath, publicSectionPath } from "@/cms/sections";

// What else points at a page, shown inside the confirmation of a move that
// breaks those pointers (`CmsContentService.references`).
//
// A warning, never a gate: the pointers live in other pages' content, which
// this action cannot rewrite, and the editor is the one who knows whether to
// fix those pages first or after. So the list is read when the confirmation
// opens, says what will happen to each kind of pointer, and links to each page
// in a new tab so the confirmation stays where it is.

export type ReferenceConsequence = "unpublish" | "rename" | "delete";

/** How many pages the list shows before it folds. A hub guide can be linked
 * from dozens; the confirmation's buttons must stay on screen. Pages readers
 * see come first (`CmsContentService.references`), so the fold hides the
 * least urgent ones. */
const COLLAPSED = 8;

export function ReferencesWarning({
  pageId,
  consequence,
  published,
}: {
  pageId: string;
  consequence: ReferenceConsequence;
  /** Whether the page was ever public — a rename leaves a redirect only then,
   * so its links keep working only then. */
  published: boolean;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: PageReferences }
    | { kind: "failed" }
  >({ kind: "loading" });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let live = true;
    pageReferencesAction({ id: pageId })
      .then((result) => {
        if (!live) return;
        setState(
          result.ok ? { kind: "ready", data: result.data } : { kind: "failed" },
        );
      })
      .catch(() => live && setState({ kind: "failed" }));
    return () => {
      live = false;
    };
  }, [pageId]);

  const note = "mt-4 mb-0 font-mono text-[12px] leading-[1.6] text-muted";

  if (state.kind === "loading") {
    return <p className={note}>Buscando páginas que apuntan a esta…</p>;
  }
  if (state.kind === "failed") {
    return (
      <p className={note}>
        No se pudo comprobar qué páginas apuntan a esta. Puedes continuar igual.
      </p>
    );
  }

  const { pages, insights } = state.data;
  const insightsLost = consequence !== "rename" && insights > 0;
  if (pages.length === 0 && !insightsLost) {
    return <p className={note}>Ninguna otra página enlaza a esta.</p>;
  }

  const links = pages.some((page) => page.links);
  const canonicals = pages.some((page) => page.canonical);

  return (
    <div
      role="status"
      className="mt-4 border-l-2 border-[var(--vendor-ochre)] pl-3"
    >
      {pages.length > 0 && (
        <>
          <p className="m-0 font-mono text-[12px] leading-[1.6] text-ink">
            {pages.length === 1
              ? "Otra página apunta a esta."
              : `${pages.length} páginas apuntan a esta.`}{" "}
            {explain(consequence, published, { links, canonicals })}
          </p>
          <ul className="mt-2 mb-0 flex list-none flex-col gap-1.5 p-0">
            {(expanded ? pages : pages.slice(0, COLLAPSED)).map((page) => (
              <li
                key={page.pageId}
                className="font-mono text-[12px] leading-[1.5] text-muted"
              >
                <Link
                  href={cmsEditPath(page.section, page.pageId)}
                  target="_blank"
                  className="text-ink underline decoration-line underline-offset-2 hover:text-accent"
                >
                  {page.title || page.slug}
                </Link>{" "}
                <span className="break-all">
                  {publicSectionPath(page.section)}/{page.slug}
                </span>
                {" · "}
                {[
                  page.links && "enlace",
                  page.canonical && "canónica",
                  !page.live && "solo en un borrador",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ))}
          </ul>
          {pages.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="mt-2 p-0 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:text-accent"
            >
              {expanded
                ? "Mostrar menos"
                : `Mostrar las ${pages.length - COLLAPSED} restantes`}
            </button>
          )}
        </>
      )}
      {insightsLost && (
        <p className="mt-2 mb-0 font-mono text-[12px] leading-[1.6] text-ink">
          {insights === 1
            ? "Un destacado apunta a esta página y deja de mostrarse."
            : `${insights} destacados apuntan a esta página y dejan de mostrarse.`}
        </p>
      )}
    </div>
  );
}

/** What happens to each kind of pointer, for this move. */
function explain(
  consequence: ReferenceConsequence,
  published: boolean,
  kinds: { links: boolean; canonicals: boolean },
): string {
  const canonical = kinds.canonicals
    ? consequence === "rename"
      ? " Las canónicas siguen apuntando a la dirección anterior hasta que se editen y se vuelvan a publicar."
      : " Una canónica que apunta a una página no publicada no vale para los buscadores."
    : "";
  if (!kinds.links) return canonical.trim();
  switch (consequence) {
    case "unpublish":
      return `Sus enlaces llevarán a una página que no existe.${canonical}`;
    case "delete":
      return `Sus enlaces quedarán rotos.${canonical}`;
    case "rename":
      return published
        ? `Sus enlaces siguen funcionando por la redirección, pero conviene actualizarlos.${canonical}`
        : `Esta página nunca fue pública, así que no queda redirección: sus enlaces quedarán rotos.${canonical}`;
  }
}
