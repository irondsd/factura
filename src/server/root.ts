import { billsRouter } from "./routers/bills";
import {
  accountsRouter,
  propertiesRouter,
  vendorsRouter,
} from "./routers/catalog";
import { insightsRouter } from "./routers/insights";
import { router } from "./trpc";

export const appRouter = router({
  bills: billsRouter,
  properties: propertiesRouter,
  vendors: vendorsRouter,
  accounts: accountsRouter,
  insights: insightsRouter,
});

export type AppRouter = typeof appRouter;
