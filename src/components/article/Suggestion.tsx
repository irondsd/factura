"use client";

import { usePathname } from "next/navigation";
import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button, ErrorBox, Field, hint, Input } from "@/components/ui";
import { FIELD_BASE } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import {
  SUGGESTION_MESSAGE_MAX,
  SUGGESTION_MESSAGE_MIN,
} from "@/lib/limits";
import { useScrolledPast } from "@/lib/useScrolledPast";

// The suggestion box on every article: "¿Tenés una sugerencia? Contanos".
// Posts to /api/suggestion, which forwards to the Telegram channel and stores
// nothing.
//
// Two placements of one panel, the same split as the table of contents:
//
// - `SuggestionAside`, from `lg` up: a small card at the foot of the sticky
//   sidebar, under the contents and anything else there. The panel opens next
//   to it.
// - `SuggestionFab`, below `lg`: an icon-only button in the bottom-right
//   corner, stacked above <BackToTop /> and appearing with it, so neither
//   covers the headline or the intro. One tap opens the panel. Its opening
//   lines say what we're asking for, so the icon doesn't need a label and
//   there's no separate "explain" step.
//
// The panel is a popover, not a modal: no backdrop, the page stays scrollable,
// Escape or a click outside closes it. Closing only hides it (it stays
// mounted), so a reader who taps away by accident gets their draft back.

type State = "idle" | "sending" | "sent";

function BubbleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 7v6M9 10h6" />
    </svg>
  );
}

/** Closes the popover on Escape (returning focus to its trigger) and on a press
 * anywhere outside `root`, which holds both the trigger and the panel. */
function useDismiss(
  open: boolean,
  close: () => void,
  root: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      trigger.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close, root, trigger]);
}

function SuggestionPanel({
  id,
  open,
  onClose,
  className,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const uid = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);

  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // The honeypot: hidden from people and from the tab order, so only a bot
  // ever fills it in.
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  // Focus the textarea on open. The panel exists to take one answer, and the
  // opening lines above it are short enough to read while typing.
  useEffect(() => {
    if (open && state !== "sent") textarea.current?.focus();
  }, [open, state]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          email: email.trim(),
          path: pathname,
          website,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Recibimos muchas sugerencias desde tu conexión. Probá de nuevo en unos minutos."
            : "No pudimos enviarla. Probá de nuevo o escribinos a support@factura.uno.",
        );
        setState("idle");
        return;
      }
      setMessage("");
      setEmail("");
      setState("sent");
    } catch {
      setError(
        "No pudimos enviarla. Probá de nuevo o escribinos a support@factura.uno.",
      );
      setState("idle");
    }
  }

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${uid}-title`}
      hidden={!open}
      className={cn("border border-line bg-card p-4 shadow-pop", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          id={`${uid}-title`}
          className="m-0 font-display text-[19px] font-semibold leading-[1.2] tracking-tight text-ink"
        >
          {state === "sent" ? "¡Gracias!" : "¿Tenés una sugerencia?"}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent text-muted transition-colors hover:text-ink"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {state === "sent" ? (
        <>
          <p className="mb-0 mt-2 font-mono text-[12.5px] leading-[1.6] text-muted">
            Nos llegó y la vamos a leer. Si dejaste tu email, te respondemos
            ahí.
          </p>
          <Button
            variant="link"
            className="mt-3"
            onClick={() => setState("idle")}
          >
            Enviar otra
          </Button>
        </>
      ) : (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
          <p className="m-0 font-mono text-[12.5px] leading-[1.6] text-muted">
            Un dato que falta, algo que no se entiende, un tema que te gustaría
            que cubramos. Contanos.
          </p>

          <textarea
            ref={textarea}
            required
            rows={4}
            aria-label="Tu sugerencia"
            minLength={SUGGESTION_MESSAGE_MIN}
            maxLength={SUGGESTION_MESSAGE_MAX}
            value={message}
            placeholder="Tu sugerencia"
            onChange={(e) => setMessage(e.target.value)}
            className={cn(FIELD_BASE, "w-full resize-y leading-[1.6]")}
          />

          <Field label="Tu email (opcional)">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              placeholder="Para poder responderte"
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {/* Honeypot, as on /contacto. */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor={`${uid}-website`}>Website</label>
            <input
              id={`${uid}-website`}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {error && <ErrorBox text={error} />}

          <Button
            type="submit"
            variant="solid"
            size="md"
            className="w-full"
            disabled={state === "sending"}
          >
            {state === "sending" ? "Enviando…" : "Enviar"}
          </Button>
          <span className={hint}>
            No guardamos tu mensaje: nos llega directo a nosotros.
          </span>
        </form>
      )}
    </div>
  );
}

/** Roughly the open panel's height. Used to decide whether it fits above the
 * sidebar card or has to open below it. */
const PANEL_HEIGHT = 440;

/** Desktop: a card at the foot of the sticky contents column. */
export function SuggestionAside() {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, trigger);

  function toggle() {
    // Where the card sits depends on how long the contents list above it is,
    // anywhere from just under the header to the bottom of the viewport. Open
    // upward when there's room, which keeps the panel next to the prose.
    const top = trigger.current?.getBoundingClientRect().top ?? 0;
    setAbove(top > PANEL_HEIGHT);
    setOpen((was) => !was);
  }

  return (
    <div ref={root} className="relative hidden lg:block">
      <button
        ref={trigger}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex w-full cursor-pointer items-start gap-2.5 border border-line bg-card px-3.5 py-3 text-left transition-colors hover:border-accent",
          open && "border-accent",
        )}
      >
        <span className="mt-px text-accent">
          <BubbleIcon size={16} />
        </span>
        <span className="font-mono text-[12.5px] leading-[1.45] text-muted">
          ¿Tenés una sugerencia?{" "}
          <span className="text-ink underline decoration-dotted underline-offset-[3px]">
            Contanos
          </span>
        </span>
      </button>

      {/* Right-aligned to the 220px column and wider than it, so it reaches
          back over the gutter. A popover, not a modal: nothing behind it is
          dimmed or locked. */}
      <SuggestionPanel
        id={panelId}
        open={open}
        onClose={close}
        className={cn(
          "absolute right-0 z-[35] w-[320px]",
          above ? "bottom-full mb-2" : "top-full mt-2",
        )}
      />
    </div>
  );
}

/** Phone and tablet: an icon button in the bottom-right corner that opens the
 * same panel as a sheet along the bottom edge. */
export function SuggestionFab() {
  const [open, setOpen] = useState(false);
  const shown = useScrolledPast();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, trigger);

  const visible = shown && !open;

  return (
    <div ref={root} className="lg:hidden">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        inert={!visible}
        aria-label="Enviar una sugerencia"
        title="¿Tenés una sugerencia?"
        className={cn(
          // Sits directly above <BackToTop /> (bottom-5, 44px tall, 12px gap)
          // and matches it, so the two read as one stack of page tools.
          "fixed bottom-[76px] right-5 z-30 flex h-11 w-11 items-center justify-center",
          "border border-line bg-card text-accent shadow-pop",
          "transition-[opacity,transform,border-color] duration-200 ease-out",
          "hover:border-accent",
          visible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <BubbleIcon />
      </button>

      {/* Covers the button stack while open, like a chat widget — z-35 puts it
          over <BackToTop /> (z-30) and still under the sticky header (z-40).
          Capped to the dynamic viewport so an on-screen keyboard can't push the
          submit button out of reach without it being scrollable. */}
      <SuggestionPanel
        id={panelId}
        open={open}
        onClose={close}
        className="fixed inset-x-3 bottom-3 z-[35] max-h-[calc(100dvh-88px)] overflow-y-auto sm:left-auto sm:w-[380px]"
      />
    </div>
  );
}
