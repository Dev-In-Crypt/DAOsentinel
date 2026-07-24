/**
 * Silent-power scoring — see TODO-042 (DAO Sentinel internal backlog).
 *
 * Pure aggregation of signals we already collect (voting power, vote
 * history). No new data source, no AI call. A delegate holding a lot of
 * voting power who has gone quiet is arguably a bigger governance risk than
 * a whale who shows up and votes in the open — their power is real but
 * unaccountable. Returns a 0-1 fraction: higher = more power sitting idle.
 */

export interface SilentPowerInput {
  votingPowerNorm: number; // 0-1, voting power normalized relative to the candidate set (e.g. VP / max VP in the batch)
  daysSinceLastVote: number | null; // null = has power but has never cast a recorded vote
}

/** Days of silence after which a delegate is scored as fully "silent". */
const SILENCE_WINDOW_DAYS = 90;

/** Delegates with power but no recorded vote ever are treated as at least this many days silent. */
const NEVER_VOTED_DAYS = SILENCE_WINDOW_DAYS;

export function scoreSilentPower(d: SilentPowerInput): number {
  const days = d.daysSinceLastVote ?? NEVER_VOTED_DAYS;
  const inactivity = clamp01(days / SILENCE_WINDOW_DAYS);
  const power = clamp01(d.votingPowerNorm);
  return power * inactivity;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
