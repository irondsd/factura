"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// The interactive half of `<Galeria>`: the tile grid and the full-screen viewer.
//
// Split from the server component that feeds it so the only thing crossing into
// the browser bundle is this file plus an array of plain image facts. The
// server half resolves the media library; nothing here knows the library
// exists.
//
// ── Why the tiles are all the same shape ──────────────────────────────────
// A gallery is written by dropping two or three screenshots into a guide, and
// screenshots come out of whatever phone or window the person had open: a
// portrait capture beside a wide one turns the row into a staircase. So every
// tile is a 4:3 frame and the image is `object-cover` inside it — the grid
// stays a grid whatever the author uploads, and the full-screen view is where
// the whole image is honoured, uncropped.

/** One image, as the browser needs it. Deliberately plain: this crosses the
 * server/client boundary, so it carries values rather than a `MediaRef`. */
export type GalleryImage = {
  src: string;
  width: number;
  height: number;
  /** What the image means here. Empty for a decorative image. */
  alt: string;
  /** The markdown title, when the author wrote one — printed under the tile
   * and under the full-screen image. Not the alt: a caption is read by
   * everyone, an alt stands in for the picture. */
  caption?: string;
  /** Animated GIFs and very large masters must be served as-is. Decided on the
   * server, where the library row is. */
  unoptimized?: boolean;
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;
/** What a double-click, or a double-tap, jumps to. */
const STEP_SCALE = 2.5;

const pad = (n: number) => String(n).padStart(2, "0");

export function GaleriaViewer({
  images,
  title,
}: {
  images: readonly GalleryImage[];
  /** Optional label above the grid, e.g. "Pantallas · Pago Rápido". */
  title?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <figure className="my-8">
      {title && (
        <figcaption className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
          <span className="fd-label text-ink">{title}</span>
          <span className="fd-label whitespace-nowrap">
            {`${pad(images.length)} imágenes`}
          </span>
        </figcaption>
      )}

      {/* auto-fit rather than a fixed column count: three tiles side by side on
          a desktop article column, two on a phone, and one when the tile would
          otherwise be a thumbnail. The author picks the pictures, not the
          layout. */}
      <ul className="grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 p-0 sm:gap-4">
        {images.map((image, index) => (
          <li key={image.src} className="m-0 p-0">
            <button
              type="button"
              onClick={() => setOpen(index)}
              aria-label={`Ampliar imagen ${index + 1} de ${images.length}${
                image.alt ? `: ${image.alt}` : ""
              }`}
              className="group flex w-full cursor-zoom-in flex-col gap-2 text-left"
            >
              <span className="relative block aspect-4/3 w-full overflow-hidden border border-line bg-card transition-colors group-hover:border-accent">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="(max-width: 719px) 50vw, 240px"
                  unoptimized={image.unoptimized}
                  loading="lazy"
                  className="object-cover"
                />
                <span className="fd-label absolute top-0 left-0 bg-ink px-2 py-[5px] text-[9px] text-paper">
                  {pad(index + 1)}
                </span>
              </span>
              {image.caption && (
                <span className="font-mono text-[11.5px] leading-[1.5] text-muted">
                  {image.caption}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2.5 font-mono text-[12px] text-muted">
        Tocá una imagen para ampliarla.
      </p>

      {open !== null && (
        <Lightbox
          images={images}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </figure>
  );
}

// ── the full-screen viewer ───────────────────────────────────────────────────

/** `smooth` rides along with the geometry rather than sitting in its own state
 * because it is a property of the *change*, not of the picture: a double-click
 * should glide, and a wheel or a pinch is already continuous — animating those
 * leaves the image lagging a frame behind the finger. */
type Transform = { scale: number; x: number; y: number; smooth: boolean };
const IDENTITY: Transform = { scale: 1, x: 0, y: 0, smooth: false };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: readonly GalleryImage[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const image = images[index];
  const panelRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);

  // The stage is sized to the picture rather than to the screen, so the arrows
  // sit beside the image instead of out at the window's edges — a small
  // screenshot would otherwise float in the middle with its controls a hand's
  // width away. It also makes "clicked outside the image" a real target: the
  // empty space around the stage belongs to the overlay, and closes it.
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(
    null,
  );
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    // Measured directly as well as observed. The observer is what catches an
    // orientation change or a caption growing a line; the direct read is what
    // guarantees a first measurement, since a browser that never delivers the
    // initial observation would leave the picture at zero by zero.
    const measure = () =>
      setFrame({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [index]);

  // Never blown up past its own pixels: an upscaled screenshot is a blurred
  // screenshot, and the zoom is there for anyone who wants it bigger anyway.
  const fit = frame
    ? Math.min(frame.width / image.width, frame.height / image.height, 1)
    : 0;
  const stageStyle = {
    width: Math.round(image.width * fit),
    height: Math.round(image.height * fit),
  };

  const step = useCallback(
    (delta: number) => onIndex((index + delta + images.length) % images.length),
    [index, images.length, onIndex],
  );

  // A new image is a new subject: keeping the previous pan would drop the
  // reader into the corner of a picture they have not seen yet. Adjusted during
  // render rather than in an effect, so the incoming image is never painted
  // once at the outgoing image's zoom.
  const [shown, setShown] = useState(index);
  if (shown !== index) {
    setShown(index);
    setTransform(IDENTITY);
  }

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);

    // The article keeps scrolling under a fixed overlay otherwise, and on a
    // phone the browser treats a pinch over the image as a page zoom.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      opener?.focus?.();
    };
  }, [onClose, step]);

  // Keep the picture in its frame. Without this a drag can throw the image off
  // the edge of the screen and leave the reader looking at an empty rectangle
  // with no way back except closing the viewer.
  const constrain = useCallback(
    (next: Transform): Transform => {
      const stage = stageRef.current;
      if (next.scale <= MIN_SCALE) return { ...IDENTITY, smooth: next.smooth };
      if (!stage) return next;
      const box = stage.getBoundingClientRect();
      // `object-contain` fits the master into the frame; the drawn size is that
      // fit times the zoom, and half the overflow is how far it may travel.
      const fit = Math.min(box.width / image.width, box.height / image.height);
      const overflowX = image.width * fit * next.scale - box.width;
      const overflowY = image.height * fit * next.scale - box.height;
      const limitX = Math.max(0, overflowX / 2);
      const limitY = Math.max(0, overflowY / 2);
      return {
        ...next,
        x: clamp(next.x, -limitX, limitX),
        y: clamp(next.y, -limitY, limitY),
      };
    },
    [image.width, image.height],
  );

  // Zoom towards a point rather than towards the middle: the reader points the
  // cursor at the field of the form they are trying to read, and that is the
  // part that should stay put as the picture grows.
  const zoomAt = useCallback(
    (factor: number, clientX: number, clientY: number, smooth = false) => {
      const stage = stageRef.current;
      if (!stage) return;
      const box = stage.getBoundingClientRect();
      const px = clientX - box.left - box.width / 2;
      const py = clientY - box.top - box.height / 2;

      setTransform((current) => {
        const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
        const ratio = scale / current.scale;
        return constrain({
          scale,
          x: px - (px - current.x) * ratio,
          y: py - (py - current.y) * ratio,
          smooth,
        });
      });
    },
    [constrain],
  );

  // Wheel has to be bound by hand: React's onWheel is passive, so calling
  // preventDefault in it does nothing and the page scrolls behind the overlay.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // deltaMode 1 is lines, 2 is pages; normalise so a trackpad and a mouse
      // wheel move the picture by comparable amounts.
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      // /600 rather than a raw multiplier: one notch of a mouse wheel is about
      // 120, so a notch moves the picture by a fifth and the whole range takes
      // nine of them — fast enough to feel direct, slow enough to stop where
      // you meant to.
      zoomAt(
        Math.exp((-event.deltaY * unit) / 600),
        event.clientX,
        event.clientY,
      );
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ── pointers ──────────────────────────────────────────────────────────────
  // One pointer pans (or, at 1×, swipes to the next image); two pinch. Held in
  // a ref rather than in state because a pointermove that re-rendered on every
  // sample would drop frames on a phone.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    /** Where the drag started. Kept apart from the running centre below,
     * which every `pointermove` overwrites — measuring a swipe against that
     * one compares the finger to itself and always comes out at zero. */
    originX: number;
    originY: number;
    distance: number;
    x: number;
    y: number;
    swipe: boolean;
  } | null>(null);

  const centre = () => {
    const points = [...pointers.current.values()];
    const sum = points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 },
    );
    return { x: sum.x / points.length, y: sum.y / points.length };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    // Captured on the stage, not on `event.target`: the picture is a child of
    // it, and a finger that leaves the frame mid-drag must keep reporting here
    // or the pan freezes half-way. Guarded because a pointer that has already
    // ended — a synthetic event, a cancelled touch — makes this throw.
    try {
      stageRef.current?.setPointerCapture(event.pointerId);
    } catch {
      /* not capturable; the events still arrive while the finger is inside */
    }
    const { x, y } = centre();
    gesture.current = {
      originX: x,
      originY: y,
      distance: spread(),
      x,
      y,
      // A drag at 1× is a swipe between images; once the picture is bigger than
      // its frame the same drag is the only way to reach the rest of it.
      swipe: pointers.current.size === 1 && transform.scale === MIN_SCALE,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const previous = gesture.current;
    const { x, y } = centre();
    const distance = spread();
    gesture.current = { ...previous, x, y, distance };

    if (pointers.current.size >= 2 && previous.distance > 0) {
      zoomAt(distance / previous.distance, x, y);
      return;
    }
    if (previous.swipe) return; // resolved on pointerup, not while moving
    setTransform((current) =>
      constrain({
        ...current,
        x: current.x + (x - previous.x),
        y: current.y + (y - previous.y),
        smooth: false,
      }),
    );
  };

  const endPointer = (event: React.PointerEvent) => {
    const start = gesture.current;
    const last = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0 || !start) gesture.current = null;
    else {
      // A finger lifted out of a pinch: the remaining one keeps going as a pan,
      // re-based on where it is now rather than on the two-finger midpoint.
      const { x, y } = centre();
      gesture.current = { ...start, x, y, distance: spread() };
    }

    if (!start?.swipe || !last || images.length < 2) return;
    // 60px of horizontal travel, and clearly more horizontal than vertical.
    const dx = last.x - start.originX;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(last.y - start.originY)) {
      step(dx < 0 ? 1 : -1);
    }
  };

  const zoomed = transform.scale > MIN_SCALE;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || `Imagen ${index + 1} de ${images.length}`}
      tabIndex={-1}
      // Paper rather than a dark scrim, and blurred rather than merely tinted:
      // the article behind is dense mono text, and at the design's 94% it stayed
      // readable enough to compete with the picture.
      className="fixed inset-0 z-[95] flex flex-col bg-[color-mix(in_srgb,var(--paper)_97%,transparent)] outline-none backdrop-blur-[8px]"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <span className="fd-label text-ink">
          {`${pad(index + 1)} / ${pad(images.length)}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center border border-line bg-card font-mono text-[15px] text-muted transition-colors hover:border-accent hover:text-accent"
        >
          ✕
        </button>
      </div>

      {/* The padding reserves the arrows' lane, so a picture that fills the
          frame still has them beside it rather than on top of it. Clicking the
          padding — anywhere that is not the picture — closes the viewer. */}
      <div
        onClick={onClose}
        className="flex min-h-0 flex-1 items-center justify-center px-12 py-4 sm:px-16"
      >
        {/* The measured box is this inner one, without the padding: what has to
            be measured is the room the picture may take, and `clientWidth`
            counts padding as part of the element. */}
        <div
          ref={frameRef}
          className="flex h-full w-full items-center justify-center"
        >
          {/* Exactly the picture's box. The arrows hang off it and the stage
            fills it; the stage has to clip the zoom, and the arrows are outside
            that clip or they would be cut off by it. */}
          <div className="relative" style={stageStyle}>
            {images.length > 1 && (
              <>
                <Arrow label="Anterior" side="left" onClick={() => step(-1)}>
                  ‹
                </Arrow>
                <Arrow label="Siguiente" side="right" onClick={() => step(1)}>
                  ›
                </Arrow>
              </>
            )}
            <div
              ref={stageRef}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onDoubleClick={(event) =>
                zoomed
                  ? setTransform({ ...IDENTITY, smooth: true })
                  : zoomAt(STEP_SCALE, event.clientX, event.clientY, true)
              }
              // touch-action:none is what keeps a pinch on the picture from
              // becoming a pinch on the page.
              className={cn(
                "absolute inset-0 touch-none overflow-hidden select-none",
                zoomed
                  ? "cursor-grab active:cursor-grabbing"
                  : "cursor-zoom-in",
              )}
            >
              <div
                className="absolute inset-0"
                style={{
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transition: transform.smooth
                    ? "transform 160ms ease"
                    : undefined,
                }}
              >
                <Image
                  key={image.src}
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="100vw"
                  unoptimized={image.unoptimized}
                  priority
                  draggable={false}
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-1 pb-5 sm:px-6 sm:pb-6">
        {(image.caption || image.alt) && (
          <p className="font-mono text-[12.5px] leading-[1.6] text-ink">
            {image.caption || image.alt}
          </p>
        )}
        {images.length > 1 && (
          <div className="flex items-center justify-center gap-2.5">
            {images.map((other, i) => (
              <button
                key={other.src}
                type="button"
                onClick={() => onIndex(i)}
                aria-label={`Ver la imagen ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "h-1.5 transition-all",
                  i === index ? "w-9 bg-accent" : "w-5 bg-line",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Hung just off the picture's edge with `right-full` / `left-full`, so the two
 * of them travel with the image instead of standing at the window's margins.
 * The click is stopped here: the space around the picture closes the viewer,
 * and an arrow sits in that space. */
function Arrow({
  label,
  side,
  onClick,
  children,
}: {
  label: string;
  side: "left" | "right";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-10 flex h-12 w-9 -translate-y-1/2 items-center justify-center",
        "border border-line bg-card font-mono text-[22px] leading-none text-muted",
        "transition-colors hover:border-accent hover:text-accent sm:w-12",
        side === "left" ? "right-full mr-2 sm:mr-3" : "left-full ml-2 sm:ml-3",
      )}
    >
      {children}
    </button>
  );
}
