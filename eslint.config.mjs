import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated, self-contained parser-suggestion worker bundle.
    "worker-dist/**",
    // Agent scratch space: `.claude/worktrees/*` holds whole checkouts of this
    // repo, so anything that walks the tree finds a second copy of every source
    // file — and lints another session's work-in-progress as if it were ours.
    // Git already ignores this directory; ESLint's flat config doesn't read
    // .gitignore, so it has to be said again here. Same reason it's excluded in
    // tsconfig.json and vitest.config.ts.
    ".claude/**",
  ]),
]);

export default eslintConfig;
