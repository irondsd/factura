import { bodyHunks, type FieldChange, type LineChange } from "../diff";
import type { VersionComparison } from "../server/contentService";
import { formatContentDateTime } from "@/lib/content-date";
import { cn } from "@/lib/cn";

// What changed between a version and the page's live publication.
//
// One baseline, always, and it is named at the top rather than assumed: a diff
// whose sides are not labelled is a diff you have to guess at, and the guess is
// wrong half the time.
//
// Additions and removals are never colour alone (cms.md §14.8). Every changed
// line carries a `+`/`−` in the gutter and a screen-reader word, and the field
// table says «antes»/«ahora» in text. Colour is the fast path for people who
// can use it, not the channel the information travels on.

export function VersionDiff({ comparison }: { comparison: VersionComparison }) {
  if (!comparison.baseline || !comparison.diff) {
    return (
      <p className="font-mono text-[13px] leading-[1.7] text-muted border border-dashed border-line px-5 py-8 text-center">
        Esta página no se ha publicado nunca, así que no hay versión publicada
        con la que compararla.
      </p>
    );
  }

  const { baseline, candidate, diff } = comparison;

  return (
    <div>
      <h3 className="font-mono text-micro uppercase tracking-label-wide text-accent m-0 mb-2">
        Comparación
      </h3>
      <p className="font-mono text-[12px] leading-[1.7] text-muted m-0 mb-5">
        <span className="text-ink">{candidate.label}</span>{" "}
        <time dateTime={candidate.at}>
          ({formatContentDateTime(candidate.at)})
        </time>
        <br />
        frente a <span className="text-ink">{baseline.label}</span>{" "}
        <time dateTime={baseline.at}>
          ({formatContentDateTime(baseline.at)})
        </time>
      </p>

      {diff.identical ? (
        <p className="font-mono text-[13px] leading-[1.7] text-muted border border-dashed border-line px-5 py-8 text-center">
          No hay diferencias: las dos versiones son idénticas.
        </p>
      ) : (
        <>
          {diff.fields.length > 0 && <FieldChanges changes={diff.fields} />}
          {diff.body.some((line) => line.kind !== "same") && (
            <BodyChanges
              lines={diff.body}
              added={diff.bodyAdded}
              removed={diff.bodyRemoved}
            />
          )}
        </>
      )}
    </div>
  );
}

const CHANGE_WORD: Record<FieldChange["kind"], string> = {
  added: "Se añadió",
  removed: "Se quitó",
  changed: "Cambió",
};

function FieldChanges({ changes }: { changes: readonly FieldChange[] }) {
  return (
    <section className="mb-7">
      <h4 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 mb-3">
        Campos ({changes.length})
      </h4>
      <ul className="list-none m-0 p-0">
        {changes.map((change) => (
          <li
            key={change.field}
            className="border-l-2 border-line pl-4 py-1 mb-4 last:mb-0"
          >
            <p className="m-0 text-[14px] leading-[1.5] text-ink">
              <span className="font-semibold">{change.label}</span>{" "}
              <span className="font-mono text-[12px] text-muted">
                {CHANGE_WORD[change.kind]}
              </span>
            </p>
            <dl className="m-0 mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
              <dt className="font-mono text-micro uppercase tracking-label-wide text-muted">
                Antes
              </dt>
              <dd className="m-0 font-mono text-[12px] leading-[1.6] text-muted whitespace-pre-wrap break-words">
                {change.base ?? "—"}
              </dd>
              <dt className="font-mono text-micro uppercase tracking-label-wide text-accent">
                Ahora
              </dt>
              <dd className="m-0 font-mono text-[12px] leading-[1.6] text-ink whitespace-pre-wrap break-words">
                {change.candidate ?? "—"}
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BodyChanges({
  lines,
  added,
  removed,
}: {
  lines: readonly LineChange[];
  added: number;
  removed: number;
}) {
  const hunks = bodyHunks(lines);
  return (
    <section>
      <h4 className="font-mono text-micro uppercase tracking-label-wide text-muted m-0 mb-3">
        Markdown · {added} {added === 1 ? "línea añadida" : "líneas añadidas"},{" "}
        {removed} {removed === 1 ? "línea quitada" : "líneas quitadas"}
      </h4>
      {/* Its own scroll container: a long code line must not push the whole
          editor sideways. */}
      <div className="overflow-x-auto border border-line bg-card">
        {hunks.map((hunk, index) => (
          <div key={index}>
            {hunk.skipped > 0 && (
              <p className="m-0 border-b border-line px-3 py-1 font-mono text-[11px] text-muted">
                … {hunk.skipped}{" "}
                {hunk.skipped === 1
                  ? "línea sin cambios"
                  : "líneas sin cambios"}
              </p>
            )}
            {hunk.lines.map((line, position) => (
              <DiffLine key={`${index}-${position}`} line={line} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

const MARK: Record<LineChange["kind"], string> = {
  added: "+",
  removed: "−",
  same: " ",
};

/** The word a screen reader hears in place of the colour and the mark. */
const SPOKEN: Record<LineChange["kind"], string | null> = {
  added: "Línea añadida:",
  removed: "Línea quitada:",
  same: null,
};

function DiffLine({ line }: { line: LineChange }) {
  const spoken = SPOKEN[line.kind];
  return (
    <div
      className={cn(
        "flex gap-2 px-3 py-[2px] font-mono text-[12px] leading-[1.6] whitespace-pre-wrap break-words",
        line.kind === "added" &&
          "bg-[color-mix(in_srgb,var(--color-ok)_12%,transparent)] text-ink",
        line.kind === "removed" &&
          "bg-[color-mix(in_srgb,var(--vendor-ochre)_12%,transparent)] text-muted line-through decoration-1",
        line.kind === "same" && "text-muted",
      )}
    >
      <span aria-hidden="true" className="shrink-0 select-none w-3 text-center">
        {MARK[line.kind]}
      </span>
      {spoken && <span className="sr-only">{spoken}</span>}
      <span className="min-w-0">{line.text || " "}</span>
    </div>
  );
}
