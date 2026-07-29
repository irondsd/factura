"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ClaimResponse } from "@/lib/probar";
import { trpc } from "@/lib/trpc";
import { interpolate } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useToasts } from "@/providers/ToastProvider";

/** Completes the /probar → sign in → "saved to your account" loop.
 *
 * `?claim=1` is set by the Save CTA on /probar and carried through login as the
 * callbackUrl. It's only a trigger: the actual submission ids live in the
 * httpOnly `probar_subs` cookie, which the browser can't read or forge, so this
 * component can't be tricked into claiming someone else's bills by a crafted
 * link.
 *
 * Brand-new accounts have usually been claimed already by the sign-up hook in
 * auth.ts, which can read the cookie but not clear it. Running here regardless
 * is what clears it — the claim endpoint is idempotent per submission, so the
 * overlap costs nothing and returns "already". */
export function ClaimSubmissions() {
  const params = useSearchParams();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { showToast } = useToasts();
  const { t } = useI18n();
  const fired = useRef(false);

  const shouldClaim = params.get("claim") === "1";

  useEffect(() => {
    if (!shouldClaim || fired.current) return;
    // Guards React's double-invoked effects in dev and any re-render before the
    // URL is cleaned up below.
    fired.current = true;

    void (async () => {
      try {
        const res = await fetch("/api/probar/claim", { method: "POST" });
        if (res.ok) {
          const { results } = (await res.json()) as ClaimResponse;
          const saved = results.filter((r) => r.status === "claimed").length;
          if (saved > 0) {
            showToast(interpolate(t.probar.claimedToast, { count: saved }));
            await utils.invalidate();
          }
        }
      } catch {
        // Their bills are still on the submission rows and the cookie survives a
        // failed request, so a retry (or the next sign-in) picks them up. Nothing
        // worth interrupting the app for.
      } finally {
        // Drop the flag so a refresh doesn't look like a second claim.
        router.replace(stripClaim(params));
      }
    })();
  }, [shouldClaim, params, router, utils, showToast, t]);

  return null;
}

function stripClaim(params: URLSearchParams): string {
  const next = new URLSearchParams(params.toString());
  next.delete("claim");
  const qs = next.toString();
  return qs ? `/app?${qs}` : "/app";
}
