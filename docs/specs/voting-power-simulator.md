# Spec · Voting-power simulator (Phase 03)

> TODO-008. Doc-only — no code in this pass. Downstream tasks: TODO-009
> (data model), TODO-010 (calculation logic), TODO-011 (UI).

## The question

*"If I delegate N tokens to address X, how often over the last 12 months
would that delegation have swung the outcome of a vote in this DAO?"*

This answers a real decision delegators face — which candidate actually
moves outcomes vs. which just collects tokens — using our own historical
vote data, no new external dependency.

## Why this, why now

- Flagged in DECISIONS.md as "the strongest next feature" once Phase 02
  ships (it has: Discord, Telegram code, Open API, badge all live/parked
  per STATE.md).
- We already store everything the calculation needs (`votes.votingPower`,
  `votes.choice`, `proposals.quorum`/`scoresTotal`/`choices`) — no schema
  change, no external key, no cron.
- Read-only, additive: cannot regress the ingestion/alert/scoring pipeline.

## Scope (this feature)

- One DAO at a time, one delegate address at a time, one hypothetical VP
  amount at a time.
- "Swing" = adding the hypothetical voter's VP to a losing choice would
  have changed which choice had the most VP, **or** pushed a
  quorum-failing proposal over quorum. Two distinct signals, reported
  separately (see Output).
- Historical replay only — this is retrospective analysis of closed
  proposals, not a prediction of future votes.
- **Out of scope for this pass:** ranked-choice/weighted vote types (our
  `votes.choice` already collapses those to one dominant choice via
  `normaliseChoice` — the simulator inherits that simplification, doesn't
  fix it), cross-DAO simulation in one run, saving/sharing a simulation
  result.

## Input model (TODO-009)

```ts
interface SimulatorInput {
  daoId: string;          // existing daos.id
  hypotheticalVp: number; // the VP the user is asking "what if I had this"
  sinceDays?: number;     // default 365, matches "last 12 months" framing
  excludeVoter?: string;  // optional: exclude this address's real vote from
                           // the tally first (simulating "what if X's vote
                           // didn't happen, and I voted with N instead")
}
```

Data accessor (read-only, no migration):

```ts
// src/server/services/simulator.ts (data-loading half, TODO-009)
async function loadClosedProposalsForSimulation(
  daoId: string,
  sinceDays: number,
): Promise<Array<{
  proposalId: string;
  title: string;
  choices: string[];
  quorum: number | null;
  votes: Array<{ voterAddress: string; choice: number; votingPower: number }>;
}>>
```

Query shape: `proposals` where `daoId = ? AND state = 'closed' AND createdAt > now() - sinceDays`,
joined to `votes` for those proposal ids. Reuses the existing
`idx_proposals_dao` and `idx_votes_proposal` indexes — no new index needed
at expected proposal-per-DAO volumes (tens to low hundreds).

## Calculation logic (TODO-010) — pure, testable

```ts
// src/server/services/simulator.ts (pure half, TODO-010)
interface SwingResult {
  proposalId: string;
  title: string;
  wouldHaveSwungOutcome: boolean;
  wouldHaveMetQuorum: boolean; // only meaningful if it originally missed quorum
  originalLeader: number;     // choice index, from computeLeadingChoice-style tally
  newLeader: number;
}

function simulateProposal(
  proposal: LoadedProposal,
  hypotheticalVp: number,
  excludeVoter?: string,
): SwingResult
```

Reuses the same tally-by-choice approach already proven in
`whale-detector.ts`'s `computeLeadingChoice` (sum VP per choice index, pick
the max) — do not reimplement that logic, extract a shared helper if the
signature fits, or call the exported `computeLeadingChoice` directly.
Quorum check: `sum(all VP including hypothetical) >= proposal.quorum`.

Assumptions to document in code comments (not fix here):
- Adds VP to whichever choice is currently *losing* (the one that would
  flip the outcome) — a delegate could in reality vote any way; the
  simulator reports the best case ("if you'd voted with the runner-up").
  UI must state this plainly (see Output).
- Does not model delegation cascades (only direct VP), matches how
  `votes.votingPower` is already recorded (final, resolved VP per Snapshot).

## Output / UI (TODO-011)

- Route: `/daos/[slug]/simulator` or a tab on the existing DAO profile —
  reuse `glass-card`/`stat-cell` primitives, no new design system.
- Inputs: hypothetical VP (number input), optional address to exclude,
  time window (dropdown: 3/6/12 months).
- Results: a list of the closed proposals in-window, each showing
  original outcome vs. simulated outcome, with a clear count summary
  ("Would have swung 2 of 14 votes in the last 12 months").
- Required disclaimer text near the results (ties into AGENTS.md's rule
  against false certainty): *"Historical replay of past votes. Assumes
  your hypothetical VP would have voted for the runner-up choice — not a
  prediction of how you'd actually vote, and not financial advice."*
- Empty state: DAO with < 3 closed proposals in the window → "Not enough
  historical data to simulate yet."

## Data model impact

None. No new columns, no migration. Purely a read path over existing
`daos`/`proposals`/`votes` tables.

## API impact

- New tRPC procedure, e.g. `daos.simulateVotingPower` (or a `simulator`
  router) — read-only, public (no auth needed, matches the rest of the
  free public-good API surface). No new REST v1 endpoint required for v1;
  can be added later if there's demand, matching TODO-008's "spec first"
  intent — don't build API surface speculatively.

## Security / reliability risks

- Pure computation over already-trusted DB rows — no new external call,
  no new secret, no rate-limit concern beyond what free-API endpoints
  already have.
- Must not be presented as investment/voting advice — ties directly into
  AGENTS.md's governance-data and AI-summary honesty rules even though no
  AI is involved here; same principle (avoid false certainty) applies to
  any simulated/hypothetical output.
- No delegate is named or accused of anything — this tool answers "would
  MY hypothetical VP have mattered", not "did delegate X manipulate
  anything." Keep copy scoped to that framing to avoid defamation-style
  wording (SECURITY_NOTES.md rule).

## Small implementation tasks (already filed, sequenced)

1. **TODO-009** — data accessor (`loadClosedProposalsForSimulation`), no UI, no calc. Verify: returns expected shape against a couple of known DAOs/proposals in dev.
2. **TODO-010** — pure `simulateProposal` calculation + unit tests (fixture-based, same pattern as `computeLeadingChoice`/`normaliseChoice` tests already landed). Verify: `npm test`.
3. **TODO-011** — UI route + tRPC wiring + disclaimer copy. Verify: `npm run build`, manual click-through in dev.

## Verification plan (for this spec)

This pass is doc-only — nothing to run. Downstream:
- TODO-009: `npm run build` (typecheck) + a manual query against dev DB.
- TODO-010: `npm test` — new fixture-driven unit tests, no network/DB.
- TODO-011: `npm run build` + `npm test` + manual verification in the running app (per AGENTS.md UI-testing rule: click through the golden path before calling it done).
