import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import {
  authAccounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { createApartmentForUser } from "./defaults";
import { sendWelcomeEmail } from "./email";
import { adoptVerifiedDefaults } from "./registry";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: authAccounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [Google],
  callbacks: {
    // Expose the user id on the session so tRPC can scope every query to it.
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  events: {
    // First sign-in: give the new account a default "Home" apartment (with its
    // seeded Buenos Aires vendors) so they can file bills immediately, and
    // auto-adopt the verified official parsers so uploads detect common bills.
    async createUser({ user }) {
      if (user.id) {
        await createApartmentForUser(db, user.id, "Home");
        await adoptVerifiedDefaults(db, user.id);
        if (user.email) await sendWelcomeEmail({ to: user.email, name: user.name });
      }
    },
  },
});
