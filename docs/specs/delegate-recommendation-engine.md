# Spec · Delegate recommendation engine

> New idea (not yet on the public roadmap page). Doc-only — no code in this
> pass. Downstream: TODO-019 (ranking calc), TODO-020 (UI).

## The question

*"I hold governance tokens in a DAO and want to delegate them — who should
I delegate to?"*

Every competing platform (DeepDAO, Tally, Boardroom) shows *who already
holds* voting power. None of them answer the newcomer's actual question.
We already collect every signal needed to answer it — this is pure
aggregation of data we already have, no new source.

## Why this, why now

- Directly differentiates from DeepDAO/Tally, which stop at "here's the
  leaderboard."
- Zero new external dependency: uses `delegates.karmaScore`, `.participationRate`,
  `.avgResponseTimeHours`, `.totalDaosActive`, `.totalVotesCast`, `.ensName`
  — all already populated by `delegate-tracker.ts` + Karma resolver.
- Cheapest idea on the list to ship — no AI call, no schema change, no
  external key.

## Scope

- Per-DAO ranked list: "Recommended delegates in {DAO}" — filterable by a
  simple weighted score, not a black-box ML ranking.
- Default ranking formula (transparent, shown to the user):
  ```
  score = participationRate * 0.4
        + (karmaScore ?? 0) / 100 * 0.3
        + min(totalDaosActive, 10) / 10 * 0.15
        + responsiveness(avgResponseTimeHours) * 0.15
  ```
  where `responsiveness` maps low hours → high score (e.g.
  `1 / (1 + hours/24)`), capped at 1.
- Ties/missing data: delegates with `karmaScore IS NULL` are not excluded
  — just scored on the remaining weighted components (re-normalize
  weights over available fields).
- **Out of scope:** ML-based personalization, "delegates like the ones
  you already follow," any recommendation that uses a user's own token
  balance (we don't have holder-level balance data).

## Data model impact

None. Pure read + compute over existing `delegates` +
`delegate_dao_activity` tables (`src/server/db/schema.ts` lines ~142-200).

## Calculation (TODO-019) — pure, testable

```ts
// src/server/services/delegate-recommendations.ts
interface DelegateScoreInput {
  participationRate: number | null;
  karmaScore: number | null;
  totalDaosActive: number | null;
  avgResponseTimeHours: number | null;
}

function scoreDelegate(d: DelegateScoreInput): number
```

Reuse the existing `avg()` helper pattern from `democracy-score.ts` for any
aggregation; keep this a pure function taking already-loaded rows, no DB
call inside — same testing pattern as `computeLeadingChoice`/
`normaliseChoice`.

## API / UI impact (TODO-020)

- New tRPC procedure `delegates.recommended({ daoSlug, limit })` — sorts
  by `scoreDelegate` descending.
- Section on `/daos/[slug]` ("Recommended delegates") or a filter on the
  existing `/delegates` leaderboard (`?sort=recommended`) — reuse
  existing leaderboard row markup, no new component needed.
- Must show the score breakdown on hover/expand (transparency — this is a
  formula, not a black box, and should read that way to the user).

## Security / honesty risks

- Must not imply endorsement or financial advice — label as "based on
  public activity signals," not "best delegate."
- Karma score is third-party (karmahq.xyz) — if it's null for most
  delegates in a DAO, the ranking degrades gracefully (re-normalized
  weights) rather than silently zeroing those delegates out.

## Sequenced follow-up tasks

1. **TODO-019** — `scoreDelegate` pure function + unit tests (fixture-based).
2. **TODO-020** — tRPC procedure + UI section, reusing `/delegates` row markup.

## Verification plan

- TODO-019: `npm test` (new fixture-driven tests, no DB/network).
- TODO-020: `npm run build` + `npm test` + manual click-through on a DAO
  with populated Karma data (e.g. Uniswap/Compound) and one with sparse
  data, to confirm graceful degradation.
