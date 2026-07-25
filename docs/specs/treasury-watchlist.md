# Spec · Treasury watchlist

> Doc-only — no code in this pass (TODO-012). Downstream: TODO-044
> (treasury history capture + drop detector, needs approval — new table),
> TODO-045 (treasury trend UI), TODO-046 (detector tests).

## The problem

`daos.treasuryUsd` (`src/server/db/schema.ts`) holds a single current
value, overwritten daily by the DeFiLlama sync
(`src/server/services/treasury-sync.ts`). Nobody gets alerted when it
moves, and there's nowhere on the site to see it move — the DAO profile
page (`/daos/[slug]`) shows Democracy Score, proposals, and alerts, but
**no treasury figure or trend at all**. A DAO could lose a third of its
treasury overnight and DAO Sentinel would silently overwrite the number
the next morning with no record anything happened.

## Important existing-code finding

The public roadmap (`src/app/(marketing)/roadmap/page.tsx`, Phase 03)
already lists *"DAO treasury watchlists — Monitor every DAO where you
hold tokens and get a cross-portfolio governance digest"*. That's a
broader, wallet-holdings-driven feature (auto-detect which DAOs a
connected wallet holds tokens in, then digest across all of them) than
what's scoped here. This spec deliberately scopes down to **treasury-drop
alerting on the DAO watchlist that already exists**
(`users.watchedDaos`) — same reasoning as the watch-any-wallet spec's
scope cut: ship the cheap, high-confidence slice now; the
wallet-holdings-auto-watch idea is a separate, larger spec if it's still
wanted later (needs a wallet-connect / on-chain balance read, which is a
bigger dependency than anything else in this batch).

## Why this, why now

- Reuses 100% of the existing alert pipeline (`alerts` table,
  `publishAlert()`, `users.watchedDaos` gating) — the same pattern proven
  out by whale-vote, swing, and quorum-risk alerts. No new delivery
  channel, no new watchlist concept.
- Closes a real gap: treasury is the one DAO-health number DAO Sentinel
  tracks that has **no history and no user-facing display at all** today
  (confirmed by reading `/daos/[slug]/page.tsx` in full — zero treasury
  references). Democracy Score has `scoreHistory` + a trend chart; votes
  and proposals have full detail pages; treasury has neither.

## Scope

- **Capture a real history.** `treasury-sync.ts`'s daily cron run
  currently only overwrites `daos.treasuryUsd` in place — insert one
  `treasuryHistory` row per DAO per run instead of (in addition to)
  overwriting the column, so a trend and a "compared to last check" delta
  both become possible.
- **Detect a drop.** A new detector, structurally identical to
  `scanQuorumRisks()` in `whale-detector.ts` (iterate candidates → derive
  a condition → dedup against existing alerts → insert + `publishAlert`):
  for each DAO with at least two `treasuryHistory` rows, compare the two
  most recent; if the drop exceeds a threshold (proposed: 15%, mirroring
  the existing whale/quorum constants living in `src/lib/constants.ts`),
  insert `alerts.type = 'treasury_drop'`.
- **Deliver through the existing pipeline, unchanged.** `publishAlert()`
  already fans a new alert row out to SSE / Telegram / Discord / Email,
  gated by `arrayContains(users.watchedDaos, [dao.slug])` on every
  channel. A `treasury_drop` alert needs **zero changes** to
  `notifier.ts`'s delivery logic — it's just a new `type` value flowing
  through code that already exists and is already reviewed. (Contrast
  with the watch-any-wallet spec, which *did* need a delivery-matching
  change — this one doesn't.) `buildAlertEmail()`'s generic-alert fallback
  already renders any unrecognized `type` with a working plain email; a
  bespoke template is a nice-to-have, not a blocker.
- **Show the trend.** Add a treasury figure + sparkline to `/daos/[slug]`
  — the one page where it's conspicuously missing today — reusing the
  same chart component pattern as `ScoreTrend` (`src/components/charts/`)
  over `treasuryHistory` instead of `scoreHistory`.
- **Out of scope:** per-asset / per-chain breakdown alerting (the
  DeFiLlama sync already collapses `currentChainTvls` into one USD sum
  in-memory before discarding the breakdown — surfacing "which token
  moved" would mean reworking the sync itself, not just adding a table);
  intraday/real-time detection (treasury data is at best daily-fresh per
  the existing cron schedule, so "drop since last check" is necessarily
  daily-granularity, not a live feed); the broader wallet-holdings
  auto-watch / cross-portfolio digest from the roadmap text (see above).

## Data model impact — **migration required, needs explicit approval**

New table, modeled directly on the existing `scoreHistory` table
(`schema.ts:231-245`) for consistency:

```ts
export const treasuryHistory = pgTable(
  'treasury_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    daoId: uuid('dao_id').notNull().references(() => daos.id, { onDelete: 'cascade' }),
    valueUsd: numeric('value_usd', { precision: 20, scale: 2 }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    daoIdx: index('idx_treasury_history_dao').on(t.daoId, t.capturedAt),
  }),
);
```

No changes to the existing `daos.treasuryUsd` column — it stays as the
"current value" convenience field (already read by `/api/v1/daos`,
`/daos` list, `/compare`, `GovPanel`, `MetricsBand`); `treasuryHistory` is
purely additive. Per AGENTS.md, a new table is a schema migration and
**requires explicit approval before implementing** — same gate already
applied to `proposal-risk-tags.md` and `proposal-diffing.md`.

## Security / reliability risks

- Same false-certainty risk shape as any drop-detector: a legitimate
  large *outflow* (funding a grant, a treasury diversification swap) will
  trigger the same alert as an *attack*. Title/description copy must
  frame this as "treasury dropped Xx — verify before assuming
  malice," matching the honesty precedent already set for whale-vote and
  risk-tag copy elsewhere in the product.
- DeFiLlama data quality is out of our control — a single bad upstream
  data point (a chain's TVL API blipping to zero) would register as a
  ~100% "drop" and a false alert. Mitigate by requiring the drop to
  persist across two consecutive daily syncs before alerting (or by
  sanity-bounding: ignore a computed drop >90% as more likely a data
  glitch than a real event, and log it instead of alerting) — exact
  guard to be finalized during TODO-044 implementation, not this spec.
- No new delivery logic, so no new alert-delivery risk beyond the
  standing AGENTS.md rule that any change touching `alerts`/`notifier.ts`
  gets tested carefully before shipping.

## Sequenced follow-up tasks

1. **TODO-044** — `treasuryHistory` table + sync-job insert + drop
   detector (needs explicit approval — new table).
2. **TODO-045** — treasury figure + trend chart on `/daos/[slug]`.
3. **TODO-046** — unit tests for the drop-detection pure logic (dedup,
   threshold, the glitch-guard from the risks section above).

## Verification plan

- TODO-044: `npm test` (detector pure logic against fixture history
  rows — normal drop, no-drop, single-datapoint no-op, glitch-guard
  case), `npm run db:migrate` (after approval), manual check that a
  seeded synthetic drop produces exactly one alert, not one per cron
  tick.
- TODO-045: `npm run build`, manual check against a DAO with 2+ history
  points once TODO-044 has run for a few days in practice.
