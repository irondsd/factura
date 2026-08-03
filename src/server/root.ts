import { accountRouter } from "./routers/account";
import { billsRouter } from "./routers/bills";
import {
  accountsRouter,
  propertiesRouter,
  vendorsRouter,
} from "./routers/catalog";
import { insightsRouter } from "./routers/insights";
import { parsersRouter } from "./routers/parsers";
import { router } from "./trpc";

export const appRouter = router({
  bills: billsRouter,
  properties: propertiesRouter,
  vendors: vendorsRouter,
  accounts: accountsRouter,
  insights: insightsRouter,
  parsers: parsersRouter,
  account: accountRouter,
});

export type AppRouter = typeof appRouter;
