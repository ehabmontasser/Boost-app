// Shared start of every dashboard page: session, brand context and the reporting period from the URL.
import { requireSession } from "./auth";
import { getCtx } from "./metrics";
import { periodOptions, resolvePeriod, type PeriodQuery } from "./period";

export type SearchParams = Promise<PeriodQuery>;

export async function pageCtx(searchParams: SearchParams) {
  const s = await requireSession();
  const c = await getCtx();
  if (!c || !c.asOf || !c.minDate) return { s, c: null, p: null, options: null } as const;
  const sp = await searchParams;
  const p = resolvePeriod(sp, c.minDate, c.asOf);
  return { s, c, p, options: periodOptions(c.minDate, c.asOf) } as const;
}
