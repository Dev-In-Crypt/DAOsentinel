# Spec · Proposal diffing (version history)

> New idea (not yet on the public roadmap page). Doc-only — no code in this
> pass. Downstream: TODO-023 (versioning capture), TODO-024 (diff UI).

## The problem

DAOs frequently edit a live proposal's body after publication — sometimes
a typo fix, sometimes a material change to the ask (budget amount,
recipient address, scope). Neither Snapshot's own UI nor any third-party
aggregator (DeepDAO/Tally/Boardroom) surfaces **what changed between
versions** of the same proposal. A delegate who read version 1 and voted
may never see that version 3 quietly changed the treasury amount.

## Why this, why now

- Directly serves the "manipulation detected" mission — silent material
  edits are a real governance-integrity risk, more concrete than most
  Phase 04 "idea" items.
- We already ingest `proposals.body` + `updatedAt` on every sync tick
  (`snapshot-sync.ts`'s `onConflictDoUpdate` already backfills `discussion`
  and other fields on existing rows — the upsert path already runs).

## Scope

- Capture a lightweight history table, **not** a full CMS-style version
  system: one row per detected body change, storing old/new body hash +
  timestamp, not every intermediate byte diff.
- Diff view: simple line-level text diff (title + body), rendered only
  when 2+ versions exist for a proposal.
- Detection: on each sync tick, if `proposals.body` (or `title`) differs
  from the stored value AND the proposal already existed, snapshot the
  *previous* body into history before overwriting.
- **Out of scope:** diffing `choices`/`scores` (those change constantly
  and aren't "edits," they're live vote tallies — already handled by
  existing sync); voting on Snapshot doesn't support per-version
  re-voting, so this is purely informational, not a "you must re-vote"
  flow.

## Data model impact

New table (needs explicit approval, per AGENTS.md — this is a migration):

```ts
export const proposalRevisions = pgTable('proposal_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id').notNull().references(() => proposals.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
});
```

## Sync impact (TODO-023)

- In `snapshot-sync.ts`'s `syncProposals()`, before the `onConflictDoUpdate`
  path runs, compare incoming `p.title`/`p.body` against the existing row
  (already fetched implicitly by the upsert — needs an explicit
  pre-fetch, or compare via a `RETURNING` clause on the update). If
  changed, insert one `proposalRevisions` row with the **old** values
  first.
- Same pattern applies to `tally-sync.ts` if/when Tally proposals get
  edited (less common for on-chain Governors, but the hook should be
  shared, not duplicated).
- Idempotency: only capture a revision when the diff is non-trivial
  (e.g. ignore whitespace-only changes) to avoid noise from
  re-normalization.

## UI impact (TODO-024)

- Proposal detail page: small "Edited N times · view history" link near
  the title, shown only when `proposalRevisions` rows exist for this
  proposal.
- Diff view: simple two-column or inline diff (reuse a lightweight
  client-side diff — no new heavy dependency; a basic line-diff
  algorithm is ~50 lines, don't pull in a large library for this).
- Label clearly: *"This proposal's text was edited after publication.
  Showing what changed."* — factual, not accusatory.

## Security / honesty risks

- Frame as transparency, not accusation — many edits are typo fixes;
  don't imply bad faith by default (SECURITY_NOTES.md defamation-wording
  rule applies here directly).
- Store full old body text (not just a hash) so the diff is actually
  useful — hashes alone would only prove *that* something changed, not
  *what*.

## Sequenced follow-up tasks

1. **TODO-023** — `proposal_revisions` migration (approval required) + capture hook in `snapshot-sync.ts`.
2. **TODO-024** — diff UI on the proposal detail page.

## Verification plan

- TODO-023: `npm test` for the diff-detection logic (pure function: given
  old body + new body, returns whether a revision should be captured,
  ignoring whitespace-only changes). Migration applied only after
  explicit approval.
- TODO-024: `npm run build` + manually edit a test proposal's body in a
  dev sync to confirm a revision row appears and the diff renders.
