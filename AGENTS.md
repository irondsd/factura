<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Package manager

Use `bun`. `bun.lock` is the tracked lockfile and it's what pins the versions
this project actually runs on. Fall back to `npm` only when `bun` isn't
installed on the machine — and when you do, don't commit the
`package-lock.json` it leaves behind: npm resolves the caret ranges in
`package.json` independently of `bun.lock`, so a stray npm lockfile pins a
second, conflicting set of versions.

# Verifying changes

Don't start the dev server to test `/app/*` (authenticated app) features without
asking first — they require a logged-in session that's hard to drive on your dev
server, and the user tests those manually. Verify by compiling instead: `build`,
`lint`, and `typecheck`. Then hand off to the user for runtime testing. Public /
unauthenticated pages are fine to run and verify yourself.
