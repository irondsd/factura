// The same problem `test/stubs/server-only.ts` solves, for scripts.
//
// `import "server-only"` is a build-time marker that Next.js resolves through
// its own alias; the package is not in node_modules, so a plain `bun` process
// cannot find it and any script touching a server module dies on the import.
// Vitest handles this with an alias in `vitest.config.ts`; bun needs a plugin,
// loaded with `--preload` by the two `media:*` scripts in package.json.
//
// Deliberately *not* a repo-wide `bunfig.toml` preload: that would run for
// every `bun` invocation, including `bun run dev` and `bun run build`, to fix a
// problem only two scripts have. And deliberately not the real `server-only`
// npm package, which is designed to throw unless the bundler sets React's
// `react-server` export condition — installing it would turn a resolution error
// into a runtime one.
//
// It weakens nothing. The guard the marker provides — a client component that
// imports server code fails to compile — is enforced by the bundler, and
// `bun run build` still runs it.

/** Declared locally rather than imported from `bun`: this file is the one place
 * in the repository that runs *only* under bun, and adding bun's global types
 * to the project's tsconfig would let them leak into application code that
 * runs under Next. */
declare const Bun: {
  plugin(definition: {
    name: string;
    setup(build: {
      module(
        specifier: string,
        callback: () => { exports: object; loader: string },
      ): void;
    }): void;
  }): void;
};

Bun.plugin({
  name: "server-only shim",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});
