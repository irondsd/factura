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
import { seedUserVendors } from "./defaults";

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
    // First sign-in: give the new account the default Buenos Aires vendors so
    // the Profile page and parsers have something to attach bills to.
    async createUser({ user }) {
      if (user.id) await seedUserVendors(db, user.id);
    },
  },
});
