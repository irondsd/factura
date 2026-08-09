import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // `.claude/worktrees/*` holds whole checkouts of this repo for agent
    // sessions, and Vitest's default include walks the entire tree — so a run
    // here would collect a second copy of every suite plus whatever another
    // session is halfway through writing. Spread the defaults rather than
    // replacing them: node_modules and dist still need to be excluded.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
