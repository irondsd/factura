import { randomInt } from "node:crypto";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq, lt } from "drizzle-orm";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { cookies } from "next/headers";
import { db } from "@/db";
import { authAccounts, sessions, users, verificationTokens } from "@/db/schema";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { claimSubmissions } from "./claim";
import { createPropertyForUser } from "./defaults";
import { sendOtpEmail, sendWelcomeEmail } from "./email";
import { adoptOfficialDefaults } from "./registry";
import { HEARTBEAT_MS, requestClientInfo } from "./sessions";
import { readTickets } from "./submissions";

/** How long a one-time code stays valid (matches the copy in emails/opt.tsx). */
const OTP_TTL_SECONDS = 10 * 60;

/**
 * The stock Drizzle adapter, plus the bookkeeping the sessions page reads.
 *
 * Two hooks, both around methods the adapter already calls on the paths we
 * need — no extra round trips on a normal request:
 *
 * - `createSession` stamps the new row with the browser and address it was
 *   signed in from.
 * - `getSessionAndUser` runs on every authenticated request, which makes it the
 *   natural heartbeat. It writes at most once per HEARTBEAT_MS per session, and
 *   a failed write is swallowed: a stale "last active" is a cosmetic problem,
 *   while a thrown error here would log the user out.
 */
function trackedAdapter(base: Adapter): Adapter {
  return {
    ...base,
    // Writes the row itself rather than delegating: the adapter's own insert is
    // typed to the three columns Auth.js knows about, and this needs the two
    // it doesn't — one insert either way.
    async createSession(data) {
      const client = await requestClientInfo();
      const [row] = await db
        .insert(sessions)
        .values({ ...data, ...client })
        .returning();
      return row;
    },
    async getSessionAndUser(sessionToken) {
      const result = await base.getSessionAndUser!(sessionToken);
      if (!result) return result;

      // Re-read the client on every request rather than trusting the sign-in
      // reading: a session that moves between networks — or between the browser
      // and the installed app — should show where it is now, which is the whole
      // point of putting any of this on the screen. Reading headers and cookies
      // is in-memory; only the write below is throttled.
      const client = await requestClientInfo();

      // Skip the write only for a reading that is both fresh AND in the past.
      // A future timestamp means the clock or the column is lying (see the
      // timezone note on the schema); writing in that case is what heals it,
      // where trusting it would stall the heartbeat until the skew ran out.
      const seen = result.session.lastActiveAt;
      const age = seen instanceof Date ? Date.now() - seen.getTime() : Infinity;
      // A surface change is worth a write of its own: waiting out the throttle
      // would leave the list calling an installed app a browser tab for five
      // minutes after it was opened.
      const moved =
        client.displayMode !== null &&
        client.displayMode !== result.session.displayMode;
      if (age >= 0 && age < HEARTBEAT_MS && !moved) return result;

      // Only overwrite with readings we actually got: a request that arrives
      // without an edge in front of it (local dev) must not blank out the
      // location a real one recorded.
      const { userAgent, ip, city, country, displayMode } = client;
      await db
        .update(sessions)
        .set({
          lastActiveAt: new Date(),
          ...(userAgent ? { userAgent } : {}),
          ...(ip ? { ip } : {}),
          ...(city ? { city } : {}),
          ...(country ? { country } : {}),
          ...(displayMode ? { displayMode } : {}),
        })
        .where(eq(sessions.sessionToken, sessionToken))
        .catch((err) => console.error("[auth] session heartbeat failed:", err));

      return result;
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: trackedAdapter(
    DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: authAccounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
  ),
  session: { strategy: "database" },
  // Bounce sign-in and verification errors back to our own /login page (e.g.
  // ?error=Verification when a code is wrong or expired) instead of the
  // built-in Auth.js pages.
  pages: { signIn: "/login", error: "/login" },
  providers: [
    // allowDangerousEmailAccountLinking lets a Google sign-in fold into an
    // existing account with the same email (e.g. one first created via email
    // OTP), so both routes reach the same account in either order. The flag
    // links unconditionally, so the signIn callback below guards it: we only
    // trust Google's email when Google says it verified it. Never enable this
    // flag on a provider whose email we can't verify — that's the account-
    // takeover vector the default (OAuthAccountNotLinked) exists to block.
    Google({ allowDangerousEmailAccountLinking: true }),
    // Email one-time-password sign-in. Reuses the verification_token table the
    // adapter already manages; on verification Auth.js links by email, so a
    // user who first signed in with Google lands in the same account. We swap
    // the default magic-link for a 6-digit code and send it via our own Resend
    // wrapper (sendVerificationRequest fully overrides the provider's sender,
    // so its apiKey is never used).
    Resend({
      from: process.env.EMAIL_FROM,
      maxAge: OTP_TTL_SECONDS,
      // Cryptographically uniform 6-digit code (000000–999999).
      generateVerificationToken: () =>
        randomInt(0, 1_000_000).toString().padStart(6, "0"),
      async sendVerificationRequest({ identifier, token }) {
        // Opportunistic GC: Postgres has no Mongo-style TTL, so sweep expired
        // codes whenever we mint a new one (consumed ones are deleted by the
        // adapter on success). Best-effort — never block sending the code.
        await db
          .delete(verificationTokens)
          .where(lt(verificationTokens.expires, new Date()))
          .catch((err) => console.error("[auth] OTP cleanup failed:", err));
        await sendOtpEmail({ to: identifier, code: token });
      },
    }),
  ],
  callbacks: {
    // Guards the auto-linking enabled above: only let a Google sign-in proceed
    // when Google vouches for the email. Runs before any account linking, so a
    // rejected login never touches an existing account. Google's OIDC ID token
    // carries email_verified as a boolean; require it to be exactly true.
    signIn({ account, profile }) {
      if (account?.provider === "google") {
        return profile?.email_verified === true;
      }
      return true;
    },
    // Expose the user id on the session so tRPC can scope every query to it.
    //
    // Returns a fresh object rather than the argument: with the database
    // strategy Auth.js passes `{...sessionRow, user}` here, and whatever this
    // returns becomes the JSON body of /api/auth/session. The row carries
    // `sessionToken` — the credential itself, httpOnly in the browser — plus
    // the tracking columns above, none of which client JS has any business
    // reading. Narrowing here keeps them server-side.
    session({ session, user }) {
      return {
        user: { ...session.user, id: user.id },
        expires: session.expires,
      };
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        // Capture the language the user registered from — the landing version
        // they came through, persisted in NEXT_LOCALE. One-time: createUser
        // fires once at account creation; later changes come from the profile
        // switch. Set before the welcome email, which reads locale from the DB.
        const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
        if (isLocale(cookieLocale)) {
          await db
            .update(users)
            .set({ locale: cookieLocale })
            .where(eq(users.id, user.id));
        }
        await createPropertyForUser(db, user.id, "Home");
        await adoptOfficialDefaults(db, user.id);

        // Sign-ups arriving from /probar carry the bills they dropped while
        // logged out. Claiming here means the account is non-empty on first
        // paint even if the OAuth redirect loses ?claim=1.
        //
        // MUST run after the two calls above: ingest files a bill into the
        // user's property and parses with their adopted set, and both of those
        // are created there. Best-effort — a claim failure must never break
        // sign-up. Note we can only READ the cookie in an Auth.js event, so
        // /app?claim=1 will retry these same rows; claimSubmissions is
        // idempotent per submission, and that retry is what clears the cookie.
        try {
          const tickets = readTickets((await cookies()).getAll());
          if (tickets.length > 0) await claimSubmissions(db, user.id, tickets);
        } catch (err) {
          console.error("[auth] claiming /probar submissions failed:", err);
        }

        if (user.email)
          await sendWelcomeEmail({ to: user.email, name: user.name });
      }
    },
  },
});
