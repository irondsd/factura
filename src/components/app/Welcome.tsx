"use client";

// Auth gate shown on every page when signed out: wordmark, one-line pitch, and
// a real "Continue with Google" button. Ported from the design prototype.
export function Welcome({ onLogin }: { onLogin: () => void }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        textAlign: "center",
      }}
    >
      <div
        className="receipt-edge"
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          padding: "40px 44px 56px",
          maxWidth: 420,
          width: "100%",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 34,
            letterSpacing: "-0.01em",
          }}
        >
          Factura<span style={{ color: "var(--accent)" }}>.</span>
        </span>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            color: "var(--muted)",
            lineHeight: 1.6,
            margin: "16px 0 0",
          }}
        >
          Drop a bill, get a ledger. Your utilities — quietly accounted for, and
          yours alone.
        </p>
        <button
          onClick={onLogin}
          className="fx-google"
          style={{
            marginTop: 28,
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--ink)",
            background: "var(--paper)",
            border: "1px solid var(--line)",
            padding: "12px 16px",
            cursor: "pointer",
            transition: "var(--transition-colors)",
          }}
        >
          <GoogleG />
          Continue with Google
        </button>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--muted)",
            margin: "20px 0 0",
            lineHeight: 1.6,
          }}
        >
          Bills are scoped to your account. Parsed text and PDFs are private to
          you.
        </p>
      </div>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "var(--muted)",
          marginTop: 24,
        }}
      >
        Parsed locally · stored securely
      </p>
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true" style={{ flex: "none" }}>
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
