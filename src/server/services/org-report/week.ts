/**
 * The ISO week a report belongs to.
 *
 * Lives in its own module rather than in `store.ts` because `store.ts` imports
 * from `index.ts`, so `index.ts` importing the week floor back from `store.ts`
 * would close a cycle. `store.ts` re-exports `startOfIsoWeekUtc` so existing
 * callers and tests keep their import path.
 *
 * This value is load-bearing twice over. It is the key of the UNIQUE index on
 * `org_reports`, so a wrong answer means either two rows for one week (the
 * customer's document changing under them) or two weeks collapsing into one.
 * And since TODO-082 it is also the LABEL the report prints: the body used to
 * be titled from the generation instant, so a report filed under 2026-07-27
 * announced itself as "week of 2026-07-31" while its own PDF subtitle,
 * filename and archive row all said the 27th.
 */

/**
 * Floors an instant to Monday 00:00:00.000 UTC of the week containing it.
 *
 * UTC throughout, deliberately: the server's local zone is not the customer's,
 * and a local-time floor would put the same instant in different weeks
 * depending on where the process runs.
 *
 * `getUTCDay()` is 0 for Sunday, so Sunday floors back six days, not forward.
 */
export function startOfIsoWeekUtc(instant: Date): Date {
  const day = instant.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return new Date(
    Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate() - daysSinceMonday,
    ),
  );
}
