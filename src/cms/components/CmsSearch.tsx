"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { formatContentDateTimeShort } from "@/lib/content-date";
import type { ContentSection } from "@/content-system/types";
import { CmsIcon } from "../icons";
import {
  CMS_SEARCHABLE_SECTIONS,
  type CmsSearchHitView,
  type CmsSearchResponse,
  highlightSegments,
  isSearchableTerm,
  MIN_CMS_SEARCH_LENGTH,
} from "../search";
import { cmsEditPath, publicSectionPath } from "../sections";
import { useModalChrome } from "./CmsDialog";
import { searchContentAction } from "../server/actions";
import { StatusChip, WorkingCopyIndicator } from "./StatusChip";

// The console's search, in the header, over every section at once.
//
// It replaces four per-section boxes that each searched titles inside the list
// you were already looking at. The question that box could answer — «is this
// guide called what I think» — is the one an editor rarely has; the one they
// do have is «¿dónde escribimos sobre el medidor?», and answering it used to
// mean opening four lists and searching each.
//
// Three deliberate restraints, all of them for the same reason — this runs a
// query over every body in the database:
//
//   * no search-as-you-type. Enter, or the button. A live search would fire one
//     of those per keystroke to save an editor one key;
//   * toggling a chip does not re-run it either. It marks the results stale and
//     says so, so narrowing costs a decision rather than a round trip; and
//   * the term and the chips are component state, not the URL. A list you can
//     bookmark is worth a query string; a search you ran on your way somewhere
//     is not, and the URL would put a server render between Enter and results.

/** Everything that survives while the overlay is open. `applied` is what
 * produced the results on screen — kept separately from the live field and
 * chips so the panel can tell the editor when the two have drifted apart. */
type SearchState = {
  term: string;
  sections: ContentSection[];
  response: CmsSearchResponse | null;
  applied: { term: string; sections: ContentSection[] } | null;
  busy: boolean;
  failed: boolean;
};

const ALL_SECTIONS = CMS_SEARCHABLE_SECTIONS.map((section) => section.id);

const initialState = (): SearchState => ({
  term: "",
  sections: ALL_SECTIONS,
  response: null,
  applied: null,
  busy: false,
  failed: false,
});

/** The header control. Mounted in `CmsShell`, so the search is one key away
 * from every screen in the console including the editor. */
export function CmsSearch() {
  const [open, setOpen] = useState(false);

  // ⌘K / Ctrl+K, the shortcut every search field in every tool this replaces
  // already answers to. Not captured: the editor's ⌘S is a different key, and
  // a field that is genuinely using ⌘K (none today) should keep it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-line bg-paper px-2.5 py-1 font-mono text-micro uppercase tracking-label-wide text-muted transition-colors hover:border-accent hover:text-accent lg:min-h-0"
      >
        <CmsIcon name="search" size="sm" />
        Buscar
        {/* The shortcut is shown where there is room for it and dropped where
            there is not — on a touch screen it is a label for a key that does
            not exist. */}
        <kbd className="hidden font-mono text-[11px] opacity-60 sm:inline">
          ⌘K
        </kbd>
      </button>
      {/* Mounted on open, so every field resets by construction and no search
          is left half-typed behind a closed overlay. */}
      {open && <SearchOverlay onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<SearchState>(initialState);
  const panel = useModalChrome({ onClose });
  const fieldId = useId();

  const { term, sections, response, applied, busy, failed } = state;
  const trimmed = term.trim();
  const canSearch = isSearchableTerm(trimmed) && sections.length > 0;

  // Whether what is on screen still answers what is in the field. Compared by
  // value: the chips are a set an editor toggles, and «guías, noticias» is the
  // same search however it was arrived at.
  const stale = useMemo(() => {
    if (!applied) return false;
    return (
      applied.term !== trimmed ||
      applied.sections.length !== sections.length ||
      applied.sections.some((id) => !sections.includes(id))
    );
  }, [applied, sections, trimmed]);

  const run = useCallback(async () => {
    const asked = { term: trimmed, sections };
    setState((prev) => ({ ...prev, busy: true, failed: false }));
    try {
      const result = await searchContentAction({
        term: asked.term,
        sections: asked.sections,
      });
      setState((prev) =>
        // A response that no longer matches the field is a search the editor
        // has already moved past — two Enters in quick succession, and the
        // slower query answering second. Dropping it is what keeps the results
        // and the box in agreement.
        prev.term.trim() === asked.term
          ? { ...prev, response: result, applied: asked, busy: false }
          : { ...prev, busy: false },
      );
    } catch {
      setState((prev) => ({ ...prev, busy: false, failed: true }));
    }
  }, [sections, trimmed]);

  const toggleSection = (id: ContentSection) =>
    setState((prev) => ({
      ...prev,
      sections: prev.sections.includes(id)
        ? prev.sections.filter((s) => s !== id)
        : // Kept in registry order rather than click order, so the chips and
          // the state they describe read the same way round.
          ALL_SECTIONS.filter((s) => s === id || prev.sections.includes(s)),
    }));

  if (typeof document === "undefined") return null;

  const hits = response?.hits ?? [];
  const hasResults = hits.length > 0;
  // The panel grows once there is something to fill it, and the flex centring
  // below is what turns that growth into the field rising towards the top of
  // the screen — no second layout, and no animation to keep in step with it.
  //
  // A search that found nothing does *not* grow it: a full screen of empty card
  // under one line of «nada coincide» says the console is loading something.
  // The panel stays the size of its answer.
  const tall = busy || hasResults;
  const answered = Boolean(response) || busy;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 sm:p-6">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_32%,transparent)]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en el CMS"
        tabIndex={-1}
        className={cn(
          "relative flex w-[min(880px,96vw)] flex-col border border-line bg-card shadow-pop outline-none",
          tall ? "h-[min(760px,88vh)]" : "max-h-[88vh]",
        )}
      >
        <div className="shrink-0 border-b border-line px-5 py-5 sm:px-7 sm:py-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSearch && !busy) void run();
            }}
            className="flex items-center gap-3"
          >
            <label htmlFor={fieldId} className="sr-only">
              Buscar en todas las secciones
            </label>
            <span aria-hidden="true" className="text-muted">
              <CmsIcon name="search" size="lg" />
            </span>
            <input
              id={fieldId}
              value={term}
              onChange={(event) =>
                setState((prev) => ({ ...prev, term: event.target.value }))
              }
              // A text field, not `type="search"`. WebKit decorates a search
              // input with its own clear button — a large blue ✕ in the
              // browser's colour, with no pointer cursor and no hover state,
              // which lands in the middle of a console whose every control is
              // a mono label in the site's palette. The one below replaces it.
              type="text"
              // Enter searches. Stated rather than left to the form's implicit
              // submission, which a search field hands to the browser under
              // conditions this component does not control — the same reason
              // `CmsPromptDialog` spells it out.
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (canSearch && !busy) void run();
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Buscar en títulos y contenido…"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-[21px] tracking-[-0.015em] text-ink outline-none placeholder:font-mono placeholder:text-[16px] placeholder:tracking-normal placeholder:text-muted"
            />
            {/* Only once there is something to clear, so the field is not
                permanently carrying a control that would do nothing. */}
            {term.length > 0 && (
              <button
                type="button"
                // Clears the results too, not just the box. A ✕ that emptied
                // the field and left the old hits under it would leave the
                // panel showing an answer to a question no longer on screen —
                // and the hint saying «Enter para actualizar» about a search
                // that cannot be run. The chips stay: they are a choice about
                // the next search, not part of this one.
                onClick={() => {
                  setState((prev) => ({
                    ...initialState(),
                    sections: prev.sections,
                  }));
                  document.getElementById(fieldId)?.focus();
                }}
                aria-label="Borrar la búsqueda"
                className="shrink-0 cursor-pointer border-0 bg-transparent p-1 leading-none text-muted transition-colors hover:text-accent"
              >
                <CmsIcon name="close" size="sm" />
              </button>
            )}
            <button
              type="submit"
              disabled={!canSearch || busy}
              className="shrink-0 cursor-pointer border border-ink bg-ink px-4 py-2 font-mono text-micro uppercase tracking-label-wide text-paper transition-colors hover:border-accent hover:bg-accent disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-muted"
            >
              {/* The trailing arrow the site's own CTAs wear. */}
              {busy ? "…" : "Buscar →"}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
            {CMS_SEARCHABLE_SECTIONS.map((section) => (
              <SectionChip
                key={section.id}
                label={section.label}
                active={sections.includes(section.id)}
                onClick={() => toggleSection(section.id)}
              />
            ))}
            <p className="ml-auto m-0 font-mono text-[12px] text-muted">
              <Hint
                busy={busy}
                failed={failed}
                sections={sections.length}
                stale={stale}
                term={trimmed}
                total={response ? hits.length : null}
                truncated={response?.truncated ?? false}
              />
            </p>
          </div>
        </div>

        {answered && (
          // The horizontal padding is split with the rows below: 3px of it
          // lives on each row so the hover fill has shoulders, and the rest
          // stays here. The two add up to what the panel's header uses, so
          // nothing on screen moves — only the highlighted area widens.
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4">
            {busy && !hasResults ? (
              <p className="my-10 text-center font-mono text-[13px] text-muted">
                Buscando…
              </p>
            ) : hasResults ? (
              <ul className="m-0 list-none p-0">
                {hits.map((hit) => (
                  <SearchHitRow
                    key={hit.id}
                    hit={hit}
                    term={applied?.term ?? trimmed}
                    onNavigate={onClose}
                  />
                ))}
              </ul>
            ) : (
              <p className="my-8 text-center font-mono text-[13px] leading-[1.7] text-muted">
                Nada coincide con «{applied?.term ?? trimmed}»
                {sections.length < ALL_SECTIONS.length &&
                  " en las secciones elegidas"}
                .
              </p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The line under the field: whatever the editor most needs to know right now,
 * one thing at a time. Ordered by urgency — a failure over a stale result over
 * a count — because two of these lines side by side is how a hint bar becomes
 * something nobody reads. */
function Hint({
  busy,
  failed,
  sections,
  stale,
  term,
  total,
  truncated,
}: {
  busy: boolean;
  failed: boolean;
  sections: number;
  stale: boolean;
  term: string;
  total: number | null;
  truncated: boolean;
}) {
  if (failed) {
    return (
      <span className="text-[var(--vendor-ochre)]">
        No se pudo buscar. Volvé a intentarlo.
      </span>
    );
  }
  if (sections === 0) return <>Elegí al menos una sección.</>;
  if (busy) return <>Buscando…</>;
  if (term.length > 0 && !isSearchableTerm(term)) {
    return <>Al menos {MIN_CMS_SEARCH_LENGTH} letras.</>;
  }
  if (stale) return <span className="text-accent">Enter para actualizar</span>;
  if (total === null) return <>Enter para buscar</>;
  if (truncated) return <>Más de {total} resultados</>;
  return (
    <>
      {total} {total === 1 ? "resultado" : "resultados"}
    </>
  );
}

function SectionChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "cursor-pointer border px-3 py-1 font-mono text-micro uppercase tracking-label-wide transition-colors",
        active
          ? "border-accent text-accent"
          : "border-dashed border-line text-muted hover:border-ink hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

/** One result. Shaped like a row of the section list — title, address, status,
 * who touched it last — so an editor arriving from a list recognises what they
 * are looking at, with the two things a list row has no reason to carry: which
 * section it came from, and the sentence the term was found in. */
function SearchHitRow({
  hit,
  term,
  onNavigate,
}: {
  hit: CmsSearchHitView;
  term: string;
  onNavigate: () => void;
}) {
  const section = CMS_SEARCHABLE_SECTIONS.find((s) => s.id === hit.section);

  return (
    <li className="border-b border-line/60 last:border-b-0">
      <Link
        href={cmsEditPath(hit.section, hit.id)}
        onClick={onNavigate}
        className="flex flex-col gap-x-6 gap-y-2 px-3 py-4 no-underline text-ink transition-colors hover:bg-paper sm:flex-row sm:items-start"
      >
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-micro uppercase tracking-label-wide text-accent">
              {section?.label ?? hit.section}
            </span>
            <span className="min-w-0 font-display text-[16px] font-semibold tracking-[-0.01em]">
              {hit.title ? (
                <Highlighted text={hit.title} term={term} />
              ) : (
                <em className="text-muted">Sin título</em>
              )}
            </span>
          </span>
          <span className="mt-0.5 block break-all font-mono text-[12px] text-muted">
            <Highlighted
              text={`${publicSectionPath(hit.section)}/${hit.slug}`}
              term={term}
            />
          </span>
          {hit.excerpt && (
            // Two lines, clamped. The excerpt is context for a match, not a
            // preview of the page: a hit whose paragraph runs long would
            // otherwise push the next three results off the screen.
            <span className="mt-1.5 line-clamp-2 block font-mono text-[12.5px] leading-[1.6] text-ink/75">
              <Highlighted text={hit.excerpt} term={term} />
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-row items-center gap-x-4 sm:w-[190px] sm:flex-col sm:items-end sm:gap-y-1">
          <span className="flex flex-col sm:items-end">
            <StatusChip status={hit.status} />
            {hit.hasWip && hit.status !== "draft" && <WorkingCopyIndicator />}
          </span>
          <span className="font-mono text-[12px] text-muted sm:text-right">
            {formatContentDateTimeShort(hit.updatedAt)}
            {hit.updatedBy && (
              <span className="block opacity-80">{hit.updatedBy}</span>
            )}
          </span>
        </div>
      </Link>
    </li>
  );
}

/** The searched-for text, marked wherever it appears. `<mark>` rather than a
 * span, so the emphasis survives being read aloud and being printed. */
function Highlighted({ text, term }: { text: string; term: string }) {
  const segments = highlightSegments(text, term);
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-inherit"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
