"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/server/auth";
import { isLocale, LOCALE_COOKIE, type Locale } from "./config";

const ONE_YEAR = 60 * 60 * 24 * 365;

// Persists the visitor's chosen locale.
//
// The cookie drives fast, anonymous-safe SSR (the root layout reads it). For a
// signed-in user we also write the locale to their row, since that's the only
// source the server has when sending emails — there's no request cookie then.
export async function setLocale(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  const session = await auth();
  const userId = session?.user?.id;
  if (userId) {
    await db.update(users).set({ locale }).where(eq(users.id, userId));
  }
}
