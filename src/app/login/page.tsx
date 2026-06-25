"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";

// Sign-in flow, all on /login:
//   choose → "Continue with Google" or "Sign in with email"
//   email  → enter address, we send a 6-digit code
//   code   → enter the code to verify
// The email steps drive the NextAuth "resend" provider: step "email" triggers
// it (redirect:false so we stay on the page); step "code" hits the provider's
// verification callback, which sets the session cookie and links to the
// matching account (incl. Google).
type Step = "choose" | "email" | "code";

export default function LoginPage() {
  // useSearchParams (read in LoginForm) needs a Suspense boundary so the page
  // can be statically prerendered.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();

  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // A failed verification redirects back here with ?error=Verification.
  const [error, setError] = useState<string | null>(
    params.get("error") ? "That code is invalid or has expired." : null,
  );

  // Already signed in (or just verified) → leave the public login page.
  useEffect(() => {
    if (status === "authenticated") router.replace("/app");
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
      callbackUrl: "/app",
    });
    window.location.href = `/api/auth/callback/resend?${qs.toString()}`;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10 text-center">
      <div className="receipt-edge bg-card border border-line pt-10 px-11 pb-14 w-full max-w-[420px]">
        <span className="font-display font-semibold text-[34px] tracking-tight">
          Factura<span className="text-accent">.</span>
        </span>

        {step === "choose" && (
          <>
            <p className="font-mono text-sm text-muted leading-[1.6] mt-4">
              Drop a bill, get a ledger. Your utilities — quietly accounted for,
              and yours alone.
            </p>
            <button
              onClick={() => signIn("google", { callbackUrl: "/app" })}
              className="mt-7 inline-flex w-full items-center justify-center gap-3 font-mono text-[13px] text-ink bg-paper border border-line py-3 px-4 cursor-pointer transition-colors hover:border-accent"
            >
              <GoogleG />
              Continue with Google
            </button>
            <button
              onClick={() => {
                setError(null);
                setStep("email");
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-3 font-mono text-[13px] text-muted py-3 px-4 cursor-pointer transition-colors hover:text-accent"
            >
              Sign in with email
            </button>
            <p className="font-mono text-[10.5px] text-muted leading-[1.6] mt-5">
              Bills are scoped to your account. Parsed text and PDFs are private
              to you.
            </p>
          </>
        )}

        {step === "email" && (
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
              <button
                type="button"
                onClick={() => {
                  setStep("choose");
                  setError(null);
                }}
                className="font-mono text-[11px] text-muted hover:text-accent transition-colors cursor-pointer"
              >
                Other ways to sign in
              </button>
            </form>
          </>
        )}

        {step === "code" && (
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

function GoogleG() {
  return (
    <svg
      viewBox="0 0 18 18"
      width="17"
      height="17"
      aria-hidden="true"
      className="flex-none"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
