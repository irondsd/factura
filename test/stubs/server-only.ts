// `import "server-only"` is a build-time marker: Next.js resolves it through its
// own alias and it exists only to make a client component that imports server
// code fail to compile. The package is not in node_modules, so Vitest — which
// resolves through Node — cannot find it, and any test touching a server module
// fails on the import rather than on anything real.
//
// Aliased to this empty module in `vitest.config.ts`. It weakens nothing: the
// guard the marker provides is enforced by the bundler at build time, and
// `bun run build` still runs it.
export {};
