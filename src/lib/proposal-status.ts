/**
 * Whether a vote is over — one definition, shared by every surface.
 *
 * Three places independently decided this and two of them got it wrong: the
 * paid report's alerts section printed "Deadline: <date>" with act-before-it
 * advice for a vote that had closed five days earlier, and the org dashboard,
 * the public DAO page and the CSV export all listed `state = 'active'` rows
 * whose voting window had ended. `fetchUpcomingWithQuorum` (upcoming-quorum.ts)
 * had the right condition all along; this module is that condition, expressed
 * for code that already holds the row rather than as a SQL predicate.
 *
 * `end <= now` counts as closed, matching `formatTimeRemaining`'s own
 * `seconds <= 0 -> 'ended'` boundary — a report generated at the exact instant
 * a vote closes must not tell the reader to go influence it.
 */

function isUsableDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/**
 * True when the voting window has closed at `now`.
 *
 * A missing deadline is NOT closed: DAO-level alerts (`score_drop`) carry no
 * proposal, and treating "no deadline" as "ended" would stamp them with a
 * closure they never had.
 */
export function hasVotingClosed(endTimestamp: Date | null | undefined, now: Date): boolean {
  if (!isUsableDate(endTimestamp)) return false;
  return endTimestamp.getTime() <= now.getTime();
}

/**
 * A row the sync has not caught up on: still `state = 'active'` in the
 * database, but its deadline has passed.
 *
 * Not the same as "closed". `state = 'closed'` rows are correctly labelled and
 * are not stale; this is specifically the lag between a vote ending and the
 * next sync noticing, which is what put an entry reading "ended · 0 votes"
 * under a dashboard heading that says ACTIVE PROPOSALS.
 */
export function isStaleActive(
  state: string | null | undefined,
  endTimestamp: Date | null | undefined,
  now: Date,
): boolean {
  return state === 'active' && hasVotingClosed(endTimestamp, now);
}
