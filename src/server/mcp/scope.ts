/** The scope this server issues. One, read-only, and named for what it is.
 *
 * Deliberately not split into per-tool scopes: the consent screen has to state
 * plainly what a client will be able to see, and "your bills, your spending,
 * your properties — read only" is a sentence a person can actually evaluate.
 * A checklist of eight scopes is not. If a write tool is ever added it gets its
 * own scope and its own line on that screen, rather than widening this one.
 *
 * Alone in its own module because ./config.ts is `server-only` (it reads
 * environment variables) while ./authorize.ts is deliberately pure so its rules
 * can be tested without a server. Both need this constant.
 */
export const MCP_SCOPE = "mcp:read";
