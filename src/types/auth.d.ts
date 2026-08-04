// The session table carries four columns Auth.js knows nothing about (see
// `sessions` in src/db/schema.ts): the public id the sessions page addresses a
// row by, and the browser / address / last-active readings it displays. The
// adapter passes whole rows through, so teaching AdapterSession about them is
// what lets src/server/auth.ts read and write them without casts.
//
// Augmenting "@auth/core/adapters" rather than "next-auth/adapters", because
// the latter is a bare `export type * from` re-export of the former.
declare module "@auth/core/adapters" {
  interface AdapterSession {
    id?: string;
    userAgent?: string | null;
    ip?: string | null;
    city?: string | null;
    country?: string | null;
    displayMode?: string | null;
    createdAt?: Date;
    lastActiveAt?: Date;
  }
}

export {};
