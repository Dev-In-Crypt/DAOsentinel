# Spec · Treasury/admin-risk proposal tags

> New idea (not yet on the public roadmap page). Doc-only — no code in this
> pass. Downstream: TODO-021 (prompt + schema), TODO-022 (UI badge).

## The problem

`proposals.aiRiskLevel` (low/medium/high — see `src/server/services/ai-summary.ts`
`SUMMARY_SYSTEM_PROMPT`) already flags *financial magnitude* ("large
treasury movements", "token economics changes"). It does **not** flag
*governance-structural* risk: does this proposal grant upgrade rights,
change a multisig signer set, or move funds to a new address outright?
No competing platform (DeepDAO, Tally, Boardroom) does explicit
security-triage of proposal content. This is the single most concrete
"watchdog" feature we could add — it's the difference between a
dashboard and an actual guard.

## Why this, why now

- Extends a pipeline we already have (`ai-summary.ts`'s single Gemini call
  per proposal) — no new external key, no new cron job, no new latency
  (same call, richer output schema).
- Directly reinforces the product's stated mission ("Every manipulation
  detected") with something concrete instead of only whale-vote heuristics.

## Scope

New structured tags, **distinct from and orthogonal to** `aiRiskLevel`:

```ts
interface GovernanceRiskTags {
  grantsAdminOrUpgradeRights: boolean; // e.g. proxy upgrade, new admin key, role grant
  movesTreasuryFunds: boolean;         // any transfer/allocation out of a treasury/multisig
  changesMultisigSigners: boolean;     // signer add/remove/threshold change
  isEmergencyOrExpedited: boolean;     // skips normal timelock/review process
}
```

- Derived from the same LLM call already made for the summary — extend
  `SUMMARY_SYSTEM_PROMPT`'s JSON output schema with these four booleans,
  not a second API call.
- Displayed as small warning chips on the proposal card/detail page
  (only render true flags — no chip clutter for routine proposals).
- **Out of scope for this pass:** on-chain static analysis of the actual
  calldata (would require decoding transaction payloads per DAO's
  Governor/Safe — a much larger effort); this pass is text-based
  detection from the proposal body only, same reliability tier as the
  existing AI summary.

## Data model impact

One migration (needs explicit approval per AGENTS.md — flag this before
implementing, don't just run it): four boolean columns on `proposals`,
all nullable (absent = "not yet classified" for already-ingested rows,
distinct from `false`).

```sql
ALTER TABLE proposals ADD COLUMN risk_admin_upgrade boolean;
ALTER TABLE proposals ADD COLUMN risk_treasury_move boolean;
ALTER TABLE proposals ADD COLUMN risk_multisig_change boolean;
ALTER TABLE proposals ADD COLUMN risk_emergency boolean;
```

## Prompt/calc impact (TODO-021)

- Extend `SUMMARY_SYSTEM_PROMPT` and `SummaryOutput` (ai-summary.ts) with
  the four new boolean fields, following the exact same
  parse-defensively pattern already used for `riskLevel` (default to
  `false`/unknown on any parse failure — never default to `true`; a false
  negative is far less harmful than a false positive here).
- No new function needed beyond extending the existing parser — this is
  explicitly NOT a new detector module, just a richer structured output
  from the call that already runs.

## UI impact (TODO-022)

- Proposal card (`/proposals`, DAO profile "Recent proposals"): small
  amber/rose chip row, e.g. "⚠ Admin rights" / "💰 Treasury move" — only
  rendered when true, reusing the existing `Badge` component variants.
- Proposal detail page: same chips near the AI summary section, with a
  one-line caveat: *"AI-detected from the proposal text — verify against
  the full proposal before acting. Not a security audit."*

## Security / honesty risks

- **Highest-stakes accuracy requirement on this list** — a false "no
  risk" reading is worse than a missing feature. Copy must always frame
  this as an AI-assisted signal, never a guarantee (ties directly into
  AGENTS.md's AI-summary and governance-data honesty rules).
- Never name or accuse a proposal's author of malicious intent — describe
  the mechanism ("grants upgrade rights"), not motive.
- Model failure/timeout must default all four flags to `null`
  (unclassified), never silently `false` presented as "verified safe."

## Sequenced follow-up tasks

1. **TODO-021** — schema migration (needs approval) + prompt/parser extension in `ai-summary.ts`.
2. **TODO-022** — UI chips on proposal card + detail page, with the caveat copy.

## Verification plan

- TODO-021: `npm test` for the parser defensive-default paths (mock LLM
  response with missing/malformed fields → all four flags `null`, never
  `true`). Migration applied via `npm run db:migrate` only after explicit
  approval, same as every other schema change in this project.
- TODO-022: `npm run build` + manual check on a known real-world treasury
  proposal to confirm the chip renders correctly.
