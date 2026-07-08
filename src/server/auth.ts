import { randomInt } from "node:crypto";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq, lt } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { cookies } from "next/headers";
import { db } from "@/db";
import { authAccounts, sessions, users, verificationTokens } from "@/db/schema";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { createPropertyForUser } from "./defaults";
import { sendOtpEmail, sendWelcomeEmail } from "./email";
import { adoptOfficialDefaults } from "./registry";

/** How long a one-time code stays valid (matches the copy in emails/opt.tsx). */
const OTP_TTL_SECONDS = 10 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  // Bounce sign-in and verification errors back to our own /login page (e.g.
  // ?error=Verification when a code is wrong or expired) instead of the
  // built-in Auth.js pages.
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Google,
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
    // Expose the user id on the session so tRPC can scope every query to it.
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
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
        if (user.email)
          await sendWelcomeEmail({ to: user.email, name: user.name });
      }
    },
  },
});
