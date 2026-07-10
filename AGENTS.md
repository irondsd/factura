<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Verifying changes

Don't start the dev server to test `/app/*` (authenticated app) features without
asking first — they require a logged-in session that's hard to drive on your dev
server, and the user tests those manually. Verify by compiling instead: `build`,
`lint`, and `typecheck`. Then hand off to the user for runtime testing. Public /
unauthenticated pages are fine to run and verify yourself.
