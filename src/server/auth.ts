import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import {
  authAccounts,
  propertyInvites,
  propertyMembers,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { createApartmentForUser } from "./defaults";
import { adoptVerifiedDefaults } from "./registry";

/** Turn every pending invite addressed to this user's email into a membership,
 * then delete the claimed invites. Runs on every sign-in; idempotent. */
async function claimPendingInvites(userId: string, email: string | null | undefined) {
  if (!email) return;
  const normalized = email.trim().toLowerCase();
  const invites = await db.query.propertyInvites.findMany({
    where: eq(propertyInvites.email, normalized),
  });
  for (const invite of invites) {
    await db
      .insert(propertyMembers)
      .values({ propertyId: invite.propertyId, userId, role: invite.role })
      .onConflictDoNothing();
    await db
      .delete(propertyInvites)
      .where(
        and(
          eq(propertyInvites.propertyId, invite.propertyId),
          eq(propertyInvites.email, normalized),
        ),
      );
  }
}

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
      }
    },
    // Claim any apartment invitations addressed to this email (works the first
    // time too, since createUser runs before signIn for a brand-new account).
    async signIn({ user }) {
      if (user.id) await claimPendingInvites(user.id, user.email);
    },
  },
});
