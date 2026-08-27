"use client";

import { type FormEvent, useId, useState } from "react";
import {
  Button,
  ErrorBox,
  Field,
  hint,
  Input,
  microLabel,
  Select,
} from "@/components/ui";
import { FIELD_BASE } from "@/components/ui/styles";
import { interpolate } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { cn } from "@/lib/cn";
import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN } from "@/lib/limits";

// The /contacto form. Posts to /api/contact, which validates and rate-limits it
// but does not deliver it anywhere yet — see the TODO in that route. Nothing
// about this component changes when delivery is wired up.
//
// The addresses beside it are the real channel; this is for the visitor who
// doesn't want to open a mail client, so it stays short: what it's about, where
// to reply, and what happened.

type State = "idle" | "sending" | "sent";

export function ContactForm() {
  const t = useT("contact");
  const locale = useLocale();
  const c = t;
  // Ids rather than a `name` per field: two of these labels are long enough to
  // wrap, and a label needs its own control to point at.
  const uid = useId();

  const [topic, setTopic] = useState(c.topics[0].id);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // The honeypot. Hidden from sight and from the tab order; a human never
  // fills it in, which is the whole signal.
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          name,
          email: email.trim(),
          message: message.trim(),
          // Which language they read the form in, so the reply can match it.
          locale,
          website,
        }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? c.errorRate : c.errorGeneric);
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError(c.errorGeneric);
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="fd-card px-6 py-8">
        <p className="font-display font-semibold text-[22px] tracking-tight m-0 mb-2">
          {c.successTitle}
        </p>
        <p className="font-mono text-sm leading-[1.7] text-muted m-0">
          {c.successBody}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={c.topicLabel}>
          <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {c.topics.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={c.nameLabel}>
          <Input
            type="text"
            value={name}
            placeholder={c.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
      </div>

      <Field label={c.emailLabel}>
        <Input
          type="email"
          required
          value={email}
          placeholder={c.emailPlaceholder}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-[5px]">
        <label htmlFor={`${uid}-message`} className={microLabel}>
          {c.messageLabel}
        </label>
        <textarea
          id={`${uid}-message`}
          required
          rows={7}
          minLength={CONTACT_MESSAGE_MIN}
          maxLength={CONTACT_MESSAGE_MAX}
          value={message}
          placeholder={c.messagePlaceholder}
          onChange={(e) => setMessage(e.target.value)}
          className={cn(FIELD_BASE, "w-full resize-y leading-[1.65]")}
        />
        <span className={hint}>
          {interpolate(c.messageHint, { max: CONTACT_MESSAGE_MAX })}
        </span>
      </div>

      {/* Honeypot — hidden from people, offered to bots. `aria-hidden` plus a
          negative tabindex keeps it out of the keyboard and screen-reader path
          rather than merely out of sight. */}
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

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          variant="solid"
          size="lg"
          disabled={state === "sending"}
        >
          {state === "sending" ? c.sending : c.submit}
        </Button>
        {/* Trusted, author-controlled dictionary HTML (one link). */}
        <span
          className={cn(
            hint,
            "[&_a]:text-accent [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-[3px]",
          )}
          dangerouslySetInnerHTML={{ __html: c.privacyNote }}
        />
      </div>
    </form>
  );
}
