"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { type FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";

// Two-step email sign-in: enter email → receive a 6-digit code → enter it.
// Step 1 triggers the NextAuth "resend" email provider (redirect:false so we
// stay on the page); step 2 hits the provider's verification callback, which
// sets the session cookie and links to the matching account (incl. Google).
type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // A failed verification redirects back here with ?error=Verification.
  const [error, setError] = useState<string | null>(
    params.get("error") ? "That code is invalid or has expired." : null,
  );

  // Already signed in (or just verified) → leave the public login page.
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await signIn("resend", { email, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError("Couldn't send a code. Check the address and try again.");
      return;
    }
    setStep("code");
  }

  function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    // The email provider verifies via a GET to its callback with the raw code;
    // on success it sets the session cookie and redirects to callbackUrl.
    const qs = new URLSearchParams({
      token: code.trim(),
      email,
      callbackUrl: "/",
    });
    window.location.href = `/api/auth/callback/resend?${qs.toString()}`;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10 text-center">
      <div className="receipt-edge bg-card border border-line pt-10 px-11 pb-14 w-full max-w-[420px]">
        <span className="font-display font-semibold text-[34px] tracking-tight">
          Factura<span className="text-accent">.</span>
        </span>

        {step === "email" ? (
          <>
            <p className="font-mono text-sm text-muted leading-[1.6] mt-4">
              Enter your email and we&apos;ll send you a 6-digit code to sign
              in.
            </p>
            <form onSubmit={requestCode} className="mt-7 flex flex-col gap-3">
              <Input
                type="email"
                name="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-center"
              />
              <Button
                type="submit"
                variant="solid"
                size="lg"
                disabled={busy}
                className="w-full"
              >
                {busy ? "Sending…" : "Send code"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="font-mono text-sm text-muted leading-[1.6] mt-4">
              We sent a code to <span className="text-ink">{email}</span>. Enter
              it below — it expires in 10 minutes.
            </p>
            <form onSubmit={verifyCode} className="mt-7 flex flex-col gap-3">
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="text-center text-lg tracking-[0.5em]"
              />
              <Button
                type="submit"
                variant="solid"
                size="lg"
                disabled={busy || code.length < 6}
                className="w-full"
              >
                {busy ? "Verifying…" : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="font-mono text-[11px] text-muted hover:text-accent transition-colors cursor-pointer"
              >
                Use a different email
              </button>
            </form>
          </>
        )}

        {error && (
          <p className="font-mono text-[11px] text-accent leading-[1.6] mt-4">
            {error}
          </p>
        )}

        <Link
          href="/"
          className="block font-mono text-[10.5px] uppercase tracking-label-wide text-muted mt-8 hover:text-accent transition-colors"
        >
          ← Back
        </Link>
      </div>
    </div>
  );
}
