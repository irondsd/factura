"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { CmsIcon } from "../../icons";

// A metadata field that folds away, with its heading doubling as the toggle and
// carrying a one-line account of what is inside — «6 preguntas», «5 / 6».
//
// The reason there is such a thing: three of the fields in this form are lists,
// and a list that is filled in is the tallest thing in the sidebar for the rest
// of the page's life. Nobody re-reads six answers while writing a title, but
// everybody wants to know they are there and how many. Collapsed, that is
// exactly what the heading says.
//
// Two rules keep the folding from ever hiding something that matters:
//
//   - a field only *starts* collapsed. It never closes itself again while the
//     editor is in it, however many entries get added.
//   - a field the validator flagged opens, and stays open. A problem the form
//     is folded over is a problem nobody can see.

export function CollapsibleField({
  label,
  required,
  help,
  summary,
  invalid,
  collapsed,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  /** What the heading says while it is closed. Empty for a field holding
   * nothing, which is also the field that does not start closed. */
  summary?: string;
  /** The validator has something to say about this field. Forces it open. */
  invalid?: boolean;
  /** Whether to start folded. Read once, at mount. */
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(!collapsed);

  // Unfold the moment the validator starts complaining about this field, and
  // only then: adjusting state on the *transition* rather than on the value
  // leaves the fold under the editor's control again once they have seen it.
  const [flagged, setFlagged] = useState(invalid);
  if (invalid !== flagged) {
    setFlagged(invalid);
    if (invalid) setOpen(true);
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        id={`${id}-label`}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 mb-1.5 text-left font-mono text-micro uppercase tracking-label-wide transition-colors hover:text-accent",
          invalid ? "text-[var(--vendor-ochre)]" : "text-muted",
        )}
      >
        <CmsIcon
          name={open ? "chevronDown" : "chevronRight"}
          size="xs"
          className="shrink-0"
        />
        <span>
          {label}
          {required && (
            <span className="text-accent ml-1" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (obligatorio)</span>}
        </span>
        {summary && (
          <span
            className={cn(
              "ml-auto normal-case",
              open ? "text-muted" : "text-ink",
            )}
          >
            {summary}
          </span>
        )}
      </button>

      <div
        id={`${id}-body`}
        role="group"
        aria-labelledby={`${id}-label`}
        hidden={!open}
      >
        {children}
        {help && (
          <p className="font-mono text-[12px] leading-[1.6] text-muted mt-1.5 mb-0">
            {help}
          </p>
        )}
      </div>
    </div>
  );
}
