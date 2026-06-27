/** Product limits shared between client UI and server validation. Kept in a
 * dependency-free module so client components can import it without pulling in
 * server-only code. */

/** How many properties a single user may *own*. Properties shared with them by
 * someone else don't count against this. */
export const OWNED_PROPERTY_LIMIT = 1;
