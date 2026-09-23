"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  insightInstant,
  type InsightCard,
} from "@/content-system/insights/types";
import { formatContentDateShort } from "@/lib/content-date";
import { cn } from "@/lib/cn";

// A horizontal rail of «destacados»: one headline-sized finding per card, each
// linking to the page that backs it.
//
// Scrolls three ways: the arrow buttons (one card-width per press), a trackpad
// or shift-wheel natively, and a plain vertical mouse wheel — which is
// translated into horizontal movement only while the rail still has room to go
// in that direction. At either end the wheel falls through to the page, so a
// reader scrolling down past the rail is never trapped in it.
//
// Presentational only: the caller fetches and filters the cards
// (`@/content-system/repository/insights`) and passes the title.

export function InsightsRail({
  title,
  insights,
  className,
}: {
  title: string;
  insights: InsightCard[];
  className?: string;
}) {
  const headingId = useId();
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // A pixel of slack: fractional widths leave scrollLeft a hair short of the
    // maximum, and the button would never disable.
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();

    const onWheel = (event: WheelEvent) => {
      // Horizontal intent (trackpad swipe, shift-wheel) is already native.
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const atStart = el.scrollLeft <= 1;
      const atEnd = el.scrollLeft >= max - 1;
      if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };

    // Non-passive, or `preventDefault` is ignored and the page scrolls too.
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const page = (direction: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card
      ? card.getBoundingClientRect().width + GAP_PX
      : el.clientWidth;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  if (insights.length === 0) return null;
  const scrollable = !(edges.start && edges.end);

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
        <h2
          id={headingId}
          className="m-0 font-display text-[24px] font-semibold tracking-[-0.02em] text-ink sm:text-[27px]"
        >
          {title}
        </h2>
        {scrollable && (
          <div className="flex flex-none gap-1.5">
            <ArrowButton
              label="Anteriores"
              disabled={edges.start}
              onClick={() => page(-1)}
            >
              ←
            </ArrowButton>
            <ArrowButton
              label="Siguientes"
              disabled={edges.end}
              onClick={() => page(1)}
            >
              →
            </ArrowButton>
          </div>
        )}
      </div>

      <ul
        ref={track}
        className="m-0 mt-5 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {insights.map((insight) => (
          <li
            key={insight.id}
            className="flex w-[80%] flex-none snap-start min-[480px]:w-[272px] sm:w-[296px]"
          >
            <Card insight={insight} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tailwind's `gap-4`, for the arrow step. */
const GAP_PX = 16;

function Card({ insight }: { insight: InsightCard }) {
  return (
    <Link
      href={insight.href}
      className="group flex w-full flex-col border border-line bg-card px-5 pt-5 pb-4 text-ink no-underline transition-colors hover:border-accent focus-visible:border-accent focus-visible:outline-none"
    >
      <span className="font-mono text-micro tracking-label text-muted uppercase">
        {formatContentDateShort(insightInstant(insight.date))}
      </span>
      <h3 className="mt-2.5 mb-0 font-display text-[23px] leading-[1.12] font-semibold tracking-tight text-pretty text-ink transition-colors group-hover:text-accent">
        {insight.title}
      </h3>
      <p className="mt-3 mb-0 font-mono text-[13px] leading-[1.6] text-pretty text-muted">
        {insight.body}
      </p>
      <span className="mt-auto flex items-end justify-between gap-3 pt-6">
        {insight.category ? (
          <span className="min-w-0 border border-line bg-paper px-2 py-1 font-mono text-[10.5px] leading-[1.4] tracking-label text-muted uppercase">
            {insight.category}
          </span>
        ) : (
          <span />
        )}
        <span className="flex-none py-1 font-mono text-micro tracking-label-wide text-accent uppercase">
          Leer →
        </span>
      </span>
    </Link>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-10 cursor-pointer items-center justify-center border border-line bg-card font-mono text-[15px] text-ink transition-colors",
        "hover:border-accent hover:text-accent disabled:cursor-default disabled:opacity-35 disabled:hover:border-line disabled:hover:text-ink",
      )}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
