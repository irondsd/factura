"use client";

// Auth gate shown on every page when signed out: wordmark, one-line pitch, and
// a real "Continue with Google" button. Ported from the design prototype.
export function Welcome({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10 text-center">
      <div className="receipt-edge bg-card border border-line pt-10 px-11 pb-14 w-full max-w-[420px]">
        <span className="font-display font-semibold text-[34px] tracking-tight">
          Factura<span className="text-accent">.</span>
        </span>
        <p className="font-mono text-sm text-muted leading-[1.6] mt-4">
          Drop a bill, get a ledger. Your utilities — quietly accounted for, and
          yours alone.
        </p>
        <button
          onClick={onLogin}
          className="mt-7 inline-flex w-full items-center justify-center gap-3 font-mono text-[13px] text-ink bg-paper border border-line py-3 px-4 cursor-pointer transition-colors hover:border-accent"
        >
          <GoogleG />
          Continue with Google
        </button>
        <p className="font-mono text-[10.5px] text-muted leading-[1.6] mt-5">
          Bills are scoped to your account. Parsed text and PDFs are private to
          you.
        </p>
      </div>
      <p className="font-mono text-[10.5px] uppercase tracking-label-wide text-muted mt-6">
        Parsed locally · stored securely
      </p>
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true" className="flex-none">
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
