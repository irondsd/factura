"use client";

import { useId, useState } from "react";
import { Eyebrow } from "@/components/landing/parts";
import { FAQ_SECTION } from "@/content/headings";
import { cn } from "@/lib/cn";

// The "Preguntas frecuentes" block an article drops in with a bare <Faq />.
// Shared by /guias, /estadisticas and /investigacion. The route injects
// `meta.faq`, so the MDX author owns the placement and the meta block owns the
// content. Every answer stays in the HTML; the accordion only changes how much
// of a long FAQ is visible at once.

const INITIALLY_OPEN = 5;

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  if (items.length === 0) return null;

  return (
    // The id is the anchor the table of contents links to. `scroll-mt` matches
    // the body headings, whose sticky header offset is the same.
    <section
      id={FAQ_SECTION.id}
      className="my-12 scroll-mt-24 border-t border-line pt-6"
    >
      <Eyebrow>{FAQ_SECTION.text}</Eyebrow>

      <dl className="mt-5 m-0 border-t border-line">
        {items.map(({ q, a }, index) => (
          <FaqItem
            key={q}
            question={q}
            answer={a}
            initiallyOpen={index < INITIALLY_OPEN}
          />
        ))}
      </dl>
    </section>
  );
}

function FaqItem({
  question,
  answer,
  initiallyOpen,
}: {
  question: string;
  answer: string;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  const answerId = `${id}-answer`;

  return (
    <div className="border-b border-line">
      <dt className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={answerId}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "flex min-h-11 w-full cursor-pointer items-center justify-between gap-4 bg-transparent py-4 text-left",
            "font-display text-[17px] leading-[1.3] font-semibold sm:text-[18px]",
            "text-ink transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
          )}
        >
          <span>{question}</span>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className={cn(
              "size-5 flex-none text-muted transition-transform duration-300 ease-[var(--ease-standard)] motion-reduce:transition-none",
              open && "rotate-180 text-accent",
            )}
          >
            <path
              d="m5 7.5 5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </dt>
      <dd
        id={answerId}
        aria-hidden={!open}
        className={cn(
          "ml-0 grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-standard)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="m-0 pr-8 pb-5 font-mono text-[14.5px] leading-[1.7] text-ink/90 sm:pr-10">
            {answer}
          </p>
        </div>
      </dd>
    </div>
  );
}
