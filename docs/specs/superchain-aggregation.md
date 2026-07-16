# Spec · Superchain / L2 governance aggregation

> New idea (not yet on the public roadmap page). Doc-only — no code in
> this pass. Downstream: TODO-026 (research + data model), TODO-027 (UI).

## The problem

Optimism Collective governance now spans multiple OP-Stack chains
(Optimism mainnet, and governance-adjacent decisions affecting Base,
Zora, and other Superchain members via the Optimism Collective's Token
House / Citizens' House structure). No aggregator gives a single
"Superchain governance health" view — everyone treats each chain's
governance in isolation, if at all.

## Why this, why now

- We already track Optimism (`snapshot-sync.ts` + Tally ingest —
  `TRACKED_DAOS` in `src/lib/constants.ts`). This is a **depth** play on
  an existing tracked DAO, not a new integration from zero.
- Directly extends our differentiator (cross-DAO delegate/voting-bloc
  analysis, already built in `delegates.ts`'s `overlapAnalysis`/`blocFor`)
  to a structure that's explicitly multi-chain by design — a natural fit
  for infrastructure we already have.

## Scope (research-first — this spec is intentionally lighter than others)

This idea needs **research before a data-model commitment**, because the
Optimism Collective's exact on-chain/off-chain structure (Token House vs.
Citizens' House vs. Season-based Intents) changes over time and isn't
fully covered by a single Snapshot space or Tally org today. TODO-026 is
explicitly a research task, not an implementation task:

1. Confirm which Snapshot space(s)/Tally org(s) currently represent
   Superchain-wide decisions vs. Optimism-mainnet-only decisions.
2. Determine whether Base/Zora governance-adjacent decisions are
   on-chain-queryable at all today, or whether this is presently
   Optimism-only in practice (in which case this becomes "deepen the
   existing Optimism tracking," not a new multi-chain feature).
3. Only after that research: decide whether new `daos` rows are needed
   (one per Superchain member) or whether this is better modeled as tags
   on the existing Optimism DAO row.

## Out of scope for now

- Do not add new tracked DAOs speculatively before the research above
  confirms real on-chain governance data exists for them.
- Do not build a "Superchain score" UI before the underlying data
  question is resolved — this would risk exactly the kind of fabricated-metric
  problem already caught and fixed once in this project (see
  DECISIONS.md, "real whale feed" / "real rollup counters" fixes).

## Data model impact

Unknown until TODO-026 research completes — likely either (a) no schema
change (tag/group existing DAOs) or (b) new `daos` rows via the existing
`TRACKED_DAOS` seed mechanism, no new table needed either way.

## Sequenced follow-up tasks

1. **TODO-026** — research task (no code): answer the three scope
   questions above, document findings in an update to this spec file.
2. **TODO-027** — implementation, scoped only after TODO-026 completes
   (a UI grouping/comparison view, most likely reusing the existing
   `/compare` page's side-by-side pattern rather than a new page).

## Verification plan

- TODO-026: no code to verify — output is a documented answer to the
  scope questions, reviewed before any implementation starts.
- TODO-027: depends entirely on what TODO-026 finds; defer detailed
  verification planning until then rather than guessing now.
