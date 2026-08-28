import { eq } from "drizzle-orm";
import { db, type Database } from "@/db";
import { propertyMembers, users } from "@/db/schema";
import { createPropertyForUser } from "./defaults";
import { adoptOfficialDefaults } from "./registry";

export type OnboardingResult = {
  propertyCreated: boolean;
};

/**
 * Idempotently establish the product-side records an authenticated identity
 * needs. Locking the identity row serializes concurrent first app requests;
 * the whole operation then commits (or rolls back) as one transaction.
 */
export async function onboardAppUser(
  database: typeof db,
  userId: string,
): Promise<OnboardingResult> {
  return database.transaction(async (tx) => onboardInTransaction(tx, userId));
}

async function onboardInTransaction(
  tx: Database,
  userId: string,
): Promise<OnboardingResult> {
  const [identity] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (!identity) throw new Error("Cannot onboard an unknown user");

  const membership = await tx.query.propertyMembers.findFirst({
    where: eq(propertyMembers.userId, userId),
    columns: { propertyId: true },
  });

  let propertyCreated = false;
  if (!membership) {
    await createPropertyForUser(tx, userId, "Home");
    propertyCreated = true;
  }

  // The insert is conflict-safe, so this also repairs a partially provisioned
  // existing account without duplicating any adoption.
  await adoptOfficialDefaults(tx, userId);

  return { propertyCreated };
}
