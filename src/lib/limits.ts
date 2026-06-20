/** Product limits shared between client UI and server validation. Kept in a
 * dependency-free module so client components can import it without pulling in
 * server-only code. */

/** How many apartments a single user may *own*. Apartments shared with them by
 * someone else don't count against this. */
export const OWNED_APARTMENT_LIMIT = 3;
