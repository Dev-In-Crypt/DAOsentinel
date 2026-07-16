# Spec · Watch any wallet (not just DAOs)

> New idea (not yet on the public roadmap page). Doc-only — no code in
> this pass. Downstream: TODO-028 (notifier wiring), TODO-029 (UI),
> TODO-030 (tests).

## The problem

Journalists, researchers, and delegates often want to track a **specific
address** — a known VC fund, a whale wallet, a rival delegate — across
whichever DAOs it votes in, not just the DAOs they personally hold
tokens in. Today our watchlist is DAO-scoped only
(`users.watchedDaos`).

## Important existing-code finding

`users.watchedDelegates` (`text[]`, `src/server/db/schema.ts` line ~261)
**already exists in the schema**, and `user.updateWatchlist` (tRPC,
`src/server/trpc/routers/user.ts`) **already accepts and persists it**.
But:
- `WatchlistEditor.tsx` (the only UI that calls `updateWatchlist`) never
  reads or writes `watchedDelegates` — only `watchedDaos`.
- `notifier.ts`'s `publishAlert()` never checks `watchedDelegates` for
  delivery — only `watchedDaos` via `arrayContains`.

**This feature is ~70% built and silently orphaned.** This changes the
scope of this spec significantly: it's a wiring task, not a new-feature
build from scratch.

## Why this, why now

- Cheapest "new" feature on this list precisely because the schema and
  mutation already exist and are already tested indirectly (the column
  round-trips through Drizzle correctly — it's just never read on the
  delivery or UI side).
- Directly serves a real, underserved use case (tracking a specific
  address's behavior across all DAOs) that no competing platform
  surfaces as a first-class watch target.

## Scope

- UI: add an "Watch a specific address" input to `/settings` (or
  `WatchlistEditor.tsx`), parallel to the existing DAO-watchlist input.
  Validate as a lowercase `0x...` address (reuse whatever address-format
  validation already exists, if any, or a simple regex — no new
  dependency).
- Delivery: extend `notifier.ts`'s `publishAlert()` — alongside the
  existing `arrayContains(users.watchedDaos, [dao.slug])` check for
  Discord/Email, add a check against `watchedDelegates` matching
  `alert.data.voter` (the address is already present in whale/swing
  alert payloads — see `whale-detector.ts`'s alert `data` shape). A user
  should get an alert if **either** their DAO watchlist **or** their
  address watchlist matches.
- **Out of scope:** watching an address that has never voted anywhere
  yet (nothing to alert on); any UI to "discover" addresses to watch
  (that's the separate delegate-recommendation-engine spec).

## Data model impact

None — `watchedDelegates` already exists. No migration needed.

## API/notifier impact (TODO-028)

- `publishAlert()` in `src/server/services/notifier.ts`: extend each
  delivery branch's `where` clause to also match on
  `arrayContains(users.watchedDelegates, [voterAddress])` (OR-combined
  with the existing DAO-slug match). This is an alert-delivery change —
  **per AGENTS.md, requires explicit approval before implementing**,
  and must be tested carefully (idempotency flags already in place must
  keep working; don't double-send to a user matched by both watchlists).

## UI impact (TODO-029)

- `WatchlistEditor.tsx`: add a second input list for addresses, calling
  the already-existing `updateWatchlist({ watchedDelegates })` mutation
  — no new tRPC procedure needed, just wiring the existing one to an
  actual UI control.
- Delegate profile page (`/delegates/[address]`): add a "Watch this
  address" button as a shortcut into the same mutation.

## Security / reliability risks

- This is alert-delivery-adjacent — flagged for explicit approval per
  AGENTS.md's alert-delivery rule, even though it reuses existing
  infrastructure.
- Address input must be lowercased/validated before storing (matches the
  existing convention — all addresses are stored lowercase elsewhere in
  this codebase, e.g. `snapshot-sync.ts`'s `v.voter.toLowerCase()`).
- No new false-certainty risk — this is a delivery filter, not a new
  heuristic.

## Sequenced follow-up tasks

1. **TODO-028** — extend `publishAlert()` delivery matching (needs explicit approval — alert delivery).
2. **TODO-029** — UI: address input in `WatchlistEditor.tsx` + "Watch this address" button on delegate profile.
3. **TODO-030** — unit tests for the OR-combined watchlist matching logic (can be written as pure logic extracted from the delivery loop, same pattern as prior notifier-adjacent test work).

## Verification plan

- TODO-028: `npm test` for the matching logic + **manual verification in
  a non-prod path before shipping** (per AGENTS.md: alert-delivery
  changes must be tested carefully before production) — e.g. trigger a
  known whale alert against a test address added to a test account's
  `watchedDelegates` and confirm exactly one delivery, not zero or
  duplicate.
- TODO-029: `npm run build` + manual click-through (add an address, add a
  DAO, confirm both save correctly and independently).
