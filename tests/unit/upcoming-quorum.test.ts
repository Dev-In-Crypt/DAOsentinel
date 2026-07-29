import { describe, it, expect } from 'vitest';
import {
  QUORUM_NOT_PUBLISHED_REASON,
  QUORUM_RISK_WINDOW_ELAPSED,
  buildUpcomingItems,
  computeQuorumProgress,
  computeVoteStanding,
  computeWindowElapsed,
  formatTimeRemaining,
  formatTimeUntilOpen,
  formatUpcomingSection,
  type QuorumProgressInput,
  type UpcomingProposalRow,
} from '@/server/services/org-report/upcoming-quorum';
import { QUORUM_RISK_THRESHOLD } from '@/lib/constants';
import { timeRemaining } from '@/lib/utils';

const NOW = new Date('2026-07-29T12:00:00.000Z');

/**
 * Default fixture: a 15-day window from 2026-07-17 to 2026-08-01, so at NOW
 * exactly 12/15 = 0.8 of the voting window has elapsed (past the 0.75 gate)
 * and 3 days remain. 31M / 50M = 62% of quorum → at risk on both counts.
 */
function row(overrides: Partial<UpcomingProposalRow> = {}): UpcomingProposalRow {
  return {
    id: 'p1',
    title: 'Fee switch activation',
    source: 'snapshot',
    state: 'active',
    startTimestamp: new Date('2026-07-17T12:00:00.000Z'),
    endTimestamp: new Date('2026-08-01T12:00:00.000Z'),
    quorum: '50000000',
    quorumReached: false,
    scoresTotal: '31000000',
    choices: ['For', 'Against'],
    scores: [23000000, 8000000],
    votesCount: 412,
    ...overrides,
  };
}

/** Defaults to the final stretch, so each test overrides only what it exercises. */
function quorumInput(overrides: Partial<QuorumProgressInput> = {}): QuorumProgressInput {
  return { scoresTotal: '31000000', quorum: '50000000', windowElapsed: 0.9, ...overrides };
}

// ===========================================================================
// computeWindowElapsed
// ===========================================================================

describe('computeWindowElapsed', () => {
  it('returns the elapsed share of the voting window', () => {
    const start = new Date('2026-07-17T12:00:00.000Z');
    const end = new Date('2026-08-01T12:00:00.000Z');
    expect(computeWindowElapsed(start, end, NOW)).toBeCloseTo(0.8);
    expect(computeWindowElapsed(start, end, start)).toBe(0);
    expect(computeWindowElapsed(start, end, end)).toBe(1);
  });

  it('returns null when end <= start (bad data, would divide by zero)', () => {
    const t = new Date('2026-07-29T12:00:00.000Z');
    expect(computeWindowElapsed(t, t, NOW)).toBeNull();
    expect(computeWindowElapsed(t, new Date('2026-07-28T12:00:00.000Z'), NOW)).toBeNull();
  });

  it('is unclamped: negative before voting opens, above 1 past the deadline', () => {
    const start = new Date('2026-07-30T12:00:00.000Z');
    const end = new Date('2026-07-31T12:00:00.000Z');
    expect(computeWindowElapsed(start, end, NOW)).toBeLessThan(0);
    expect(computeWindowElapsed(start, end, new Date('2026-08-02T12:00:00.000Z'))).toBeGreaterThan(1);
  });
});

// ===========================================================================
// computeQuorumProgress — the five states
// ===========================================================================

describe('computeQuorumProgress', () => {
  it('reports an explicit not_published state when quorum is null (every Tally row)', () => {
    const q = computeQuorumProgress(quorumInput({ quorum: null }));
    expect(q.status).toBe('not_published');
    if (q.status !== 'not_published') throw new Error('unreachable');
    expect(q.reason).toBe(QUORUM_NOT_PUBLISHED_REASON);
    // The whole point: no percentage exists on this variant at all, so no
    // caller can read 0% off a proposal whose quorum was never published.
    expect(q).not.toHaveProperty('pct');
    expect(JSON.stringify(q)).not.toContain('0');
  });

  it('does not surface quorumReached when quorum is null (tally-sync writes false as a placeholder)', () => {
    // tally-sync.ts: `quorum: null, quorumReached: false` — that `false` means
    // "unknown", not "quorum was missed". It must never reach the customer.
    const q = computeQuorumProgress(quorumInput({ quorum: null, quorumReached: false }));
    expect(q.status).toBe('not_published');
    expect(q).not.toHaveProperty('quorumReached');
    expect(q).not.toHaveProperty('windowElapsed');
  });

  it('treats undefined and a zero/negative quorum as not_published too (no denominator)', () => {
    expect(computeQuorumProgress(quorumInput({ quorum: undefined })).status).toBe('not_published');
    expect(computeQuorumProgress(quorumInput({ quorum: '0' })).status).toBe('not_published');
    expect(computeQuorumProgress(quorumInput({ quorum: 0 })).status).toBe('not_published');
    expect(computeQuorumProgress(quorumInput({ quorum: '-5' })).status).toBe('not_published');
    expect(computeQuorumProgress(quorumInput({ quorum: 'not-a-number' })).status).toBe('not_published');
  });

  it('flags at_risk below the quorum threshold once the window is in its final stretch', () => {
    const q = computeQuorumProgress(quorumInput({ windowElapsed: 0.9 })); // 62% of quorum
    expect(q.status).toBe('at_risk');
    if (q.status === 'not_published') throw new Error('unreachable');
    expect(q.pct).toBeCloseTo(62);
  });

  it('flags on_track exactly at the quorum threshold (>= matches scanQuorumRisks)', () => {
    const quorum = 1000;
    const atThreshold = quorum * QUORUM_RISK_THRESHOLD; // 800
    expect(
      computeQuorumProgress({ scoresTotal: atThreshold, quorum, windowElapsed: 0.99 }).status,
    ).toBe('on_track');
    expect(
      computeQuorumProgress({ scoresTotal: atThreshold - 1, quorum, windowElapsed: 0.99 }).status,
    ).toBe('at_risk');
  });

  it('flags on_track above the threshold but below 100% (on track != met)', () => {
    const q = computeQuorumProgress(quorumInput({ scoresTotal: '45000000' })); // 90%
    expect(q.status).toBe('on_track');
    if (q.status === 'not_published') throw new Error('unreachable');
    expect(q.pct).toBeCloseTo(90);
  });

  it('reports quorum met, keeping the real >100% figure uncapped', () => {
    const q = computeQuorumProgress(quorumInput({ scoresTotal: '62500000' })); // 125%
    expect(q.status).toBe('met');
    if (q.status === 'not_published') throw new Error('unreachable');
    expect(q.pct).toBeCloseTo(125);
  });

  it('honours the provider quorumReached flag even when the ratio is short of 100%', () => {
    expect(computeQuorumProgress(quorumInput({ quorumReached: true })).status).toBe('met');
  });

  it('treats a null scoresTotal as 0 progress against a REAL quorum (0% is honest here)', () => {
    const q = computeQuorumProgress(quorumInput({ scoresTotal: null }));
    expect(q.status).toBe('at_risk');
    if (q.status === 'not_published') throw new Error('unreachable');
    expect(q.pct).toBe(0);
  });
});

// ===========================================================================
// The window-elapsed dimension — regression guard for the "cries wolf on a
// vote that just opened" bug, and for contradicting the alerts section.
// ===========================================================================

describe('computeQuorumProgress window guard (mirrors scanQuorumRisks)', () => {
  it('does NOT flag 0% quorum at risk while most of the voting window remains', () => {
    // A vote that opened two hours ago has nobody to blame for 0 turnout, and
    // scanQuorumRisks would not have raised an alert for it either.
    const q = computeQuorumProgress({ scoresTotal: '0', quorum: '10000000', windowElapsed: 0.05 });
    expect(q.status).toBe('too_early_to_call');
    expect(q.status).not.toBe('at_risk');
  });

  it('DOES flag 0% quorum at risk once over 75% of the window has elapsed', () => {
    const q = computeQuorumProgress({ scoresTotal: '0', quorum: '10000000', windowElapsed: 0.8 });
    expect(q.status).toBe('at_risk');
  });

  it("flags exactly at the window boundary (progress < 0.75 is the alert's skip condition)", () => {
    const base = { scoresTotal: '0', quorum: '10000000' };
    expect(computeQuorumProgress({ ...base, windowElapsed: QUORUM_RISK_WINDOW_ELAPSED }).status).toBe(
      'at_risk',
    );
    expect(
      computeQuorumProgress({ ...base, windowElapsed: QUORUM_RISK_WINDOW_ELAPSED - 0.0001 }).status,
    ).toBe('too_early_to_call');
  });

  it('never flags at_risk when windowElapsed is null (alert skips dur <= 0 rows too)', () => {
    const q = computeQuorumProgress({ scoresTotal: '0', quorum: '10000000', windowElapsed: null });
    expect(q.status).toBe('too_early_to_call');
  });

  it('ignores the window entirely once quorum is on track or met', () => {
    // The window only gates the at-risk call; a healthy quorum is healthy at
    // any point in the window.
    expect(computeQuorumProgress(quorumInput({ scoresTotal: '45000000', windowElapsed: 0.01 })).status).toBe('on_track');
    expect(computeQuorumProgress(quorumInput({ scoresTotal: '45000000', windowElapsed: 0.99 })).status).toBe('on_track');
    expect(computeQuorumProgress(quorumInput({ scoresTotal: '62500000', windowElapsed: 0.01 })).status).toBe('met');
  });

  it('carries windowElapsed through on the published variant', () => {
    const q = computeQuorumProgress(quorumInput({ windowElapsed: 0.42 }));
    if (q.status === 'not_published') throw new Error('unreachable');
    expect(q.windowElapsed).toBe(0.42);
  });
});

// ===========================================================================
// numeric-as-string coercion
// ===========================================================================

describe('computeQuorumProgress numeric coercion', () => {
  it('produces identical results for string and number inputs (numeric columns arrive as strings)', () => {
    expect(computeQuorumProgress({ scoresTotal: '31000000', quorum: '50000000', windowElapsed: 0.9 })).toEqual(
      computeQuorumProgress({ scoresTotal: 31000000, quorum: 50000000, windowElapsed: 0.9 }),
    );
  });

  it('compares numerically, not lexicographically ("9" > "10" is true for strings)', () => {
    // Lexicographic comparison would rate 9/10 = 90% as >= 1 and call it met;
    // numeric comparison correctly says on_track.
    const q = computeQuorumProgress({ scoresTotal: '9', quorum: '10', windowElapsed: 0.9 });
    expect(q.status).toBe('on_track');
    if (q.status === 'not_published') throw new Error('unreachable');
    expect(q.pct).toBeCloseTo(90);
  });

  it('does not mistake a small string total for a large one (100 vs 9)', () => {
    const q = computeQuorumProgress({ scoresTotal: '100', quorum: '9', windowElapsed: 0.9 }); // 1111%
    expect(q.status).toBe('met');
    if (q.status === 'not_published') throw new Error('unreachable');
    expect(q.scoresTotal).toBe(100);
    expect(q.quorum).toBe(9);
  });

  it('handles decimal numeric strings', () => {
    const q = computeQuorumProgress({ scoresTotal: '80.5', quorum: '100', windowElapsed: 0.9 });
    expect(q.status).toBe('on_track');
    if (q.status === 'not_published') throw new Error('unreachable');
    expect(q.pct).toBeCloseTo(80.5);
  });
});

// ===========================================================================
// computeVoteStanding
// ===========================================================================

describe('computeVoteStanding', () => {
  it('returns the leader, its share of scoresTotal, and the margin over the runner-up', () => {
    const s = computeVoteStanding(['For', 'Against'], [75, 25], '100');
    expect(s).not.toBeNull();
    expect(s?.leadingChoice).toBe('For');
    expect(s?.leadingScore).toBe(75);
    expect(s?.leadingSharePct).toBeCloseTo(75);
    expect(s?.runnerUpChoice).toBe('Against');
    expect(s?.marginPct).toBeCloseTo(50);
  });

  it('picks the runner-up correctly with more than two choices', () => {
    const s = computeVoteStanding(['For', 'Against', 'Abstain'], [10, 60, 30], '100');
    expect(s?.leadingChoice).toBe('Against');
    expect(s?.runnerUpChoice).toBe('Abstain');
    expect(s?.marginPct).toBeCloseTo(30);
  });

  it('handles the leader appearing last in the array', () => {
    const s = computeVoteStanding(['A', 'B', 'C'], [10, 20, 70], '100');
    expect(s?.leadingChoice).toBe('C');
    expect(s?.runnerUpChoice).toBe('B');
  });

  it('returns null when scores are missing (null / undefined / not an array)', () => {
    expect(computeVoteStanding(['For', 'Against'], null, '100')).toBeNull();
    expect(computeVoteStanding(['For', 'Against'], undefined, '100')).toBeNull();
    expect(computeVoteStanding(['For', 'Against'], 'nope', '100')).toBeNull();
  });

  it('returns null for an empty scores array', () => {
    expect(computeVoteStanding(['For', 'Against'], [], '100')).toBeNull();
  });

  it('returns null for all-zero scores instead of crowning a leader with 0%', () => {
    expect(computeVoteStanding(['For', 'Against'], [0, 0], '0')).toBeNull();
  });

  it('reports a single-choice proposal as unopposed, with no runner-up or margin', () => {
    const s = computeVoteStanding(['Approve'], [1000], '1000');
    expect(s?.leadingChoice).toBe('Approve');
    expect(s?.leadingSharePct).toBeCloseTo(100);
    expect(s?.runnerUpChoice).toBeNull();
    expect(s?.runnerUpScore).toBeNull();
    expect(s?.marginPct).toBeNull();
  });

  it('handles scores SHORTER than choices (only the present scores count)', () => {
    const s = computeVoteStanding(['For', 'Against', 'Abstain'], [10, 40], '50');
    expect(s?.leadingChoice).toBe('Against');
    expect(s?.runnerUpChoice).toBe('For');
    expect(s?.marginPct).toBeCloseTo(60);
  });

  it('handles scores LONGER than choices with a positional label, never "undefined"', () => {
    const s = computeVoteStanding(['For'], [10, 40], '50');
    expect(s?.leadingChoice).toBe('Choice 2');
    expect(s?.runnerUpChoice).toBe('For');
  });

  it('falls back to a positional label when choices are missing or non-string', () => {
    expect(computeVoteStanding(null, [10, 40], '50')?.leadingChoice).toBe('Choice 2');
    expect(computeVoteStanding([42, ''], [10, 40], '50')?.leadingChoice).toBe('Choice 2');
  });

  it('falls back to the sum of scores when scoresTotal is missing or zero', () => {
    expect(computeVoteStanding(['For', 'Against'], [75, 25], null)?.leadingSharePct).toBeCloseTo(75);
    expect(computeVoteStanding(['For', 'Against'], [75, 25], '0')?.leadingSharePct).toBeCloseTo(75);
  });

  it('uses the stored scoresTotal as the denominator when it exceeds the sum', () => {
    // A partially-synced scores array must not inflate the leader's share.
    const s = computeVoteStanding(['For', 'Against'], [40, 10], '100');
    expect(s?.leadingSharePct).toBeCloseTo(40);
    expect(s?.marginPct).toBeCloseTo(30);
  });

  it('coerces string score elements and clamps negatives to zero', () => {
    const s = computeVoteStanding(['For', 'Against'], ['75', -5], '75');
    expect(s?.leadingChoice).toBe('For');
    expect(s?.runnerUpScore).toBe(0);
  });

  it('breaks a tie on the first index, matching computeLeadingChoice', () => {
    const s = computeVoteStanding(['For', 'Against'], [50, 50], '100');
    expect(s?.leadingChoice).toBe('For');
    expect(s?.marginPct).toBeCloseTo(0);
  });
});

// ===========================================================================
// time helpers
// ===========================================================================

describe('formatTimeRemaining / formatTimeUntilOpen', () => {
  it('buckets into days, hours and minutes', () => {
    expect(formatTimeRemaining(new Date('2026-08-01T12:00:00.000Z'), NOW)).toBe('3d left');
    expect(formatTimeRemaining(new Date('2026-07-29T17:00:00.000Z'), NOW)).toBe('5h left');
    expect(formatTimeRemaining(new Date('2026-07-29T12:30:00.000Z'), NOW)).toBe('30m left');
  });

  it('says "ended" for a deadline that has passed', () => {
    expect(formatTimeRemaining(new Date('2026-07-28T12:00:00.000Z'), NOW)).toBe('ended');
    expect(formatTimeRemaining(NOW, NOW)).toBe('ended');
  });

  it('agrees with timeRemaining() from src/lib/utils.ts on the live clock (drift guard)', () => {
    const end = new Date(Date.now() + 3 * 86400_000 + 3600_000);
    expect(formatTimeRemaining(end)).toBe(timeRemaining(end));
  });

  it('describes lead time before voting opens', () => {
    expect(formatTimeUntilOpen(new Date('2026-07-31T12:00:00.000Z'), NOW)).toBe('opens in 2d');
    expect(formatTimeUntilOpen(new Date('2026-07-29T14:00:00.000Z'), NOW)).toBe('opens in 2h');
    expect(formatTimeUntilOpen(new Date('2026-07-29T11:00:00.000Z'), NOW)).toBe('opening now');
  });
});

// ===========================================================================
// buildUpcomingItems
// ===========================================================================

describe('buildUpcomingItems', () => {
  it('maps an active row into an open item with quorum and standing', () => {
    const [item] = buildUpcomingItems([row()], NOW);
    expect(item?.phase).toBe('open');
    if (item?.phase !== 'open') throw new Error('unreachable');
    expect(item.timeLeft).toBe('3d left');
    expect(item.votesCount).toBe(412);
    expect(item.quorum.status).toBe('at_risk');
    expect(item.standing?.leadingChoice).toBe('For');
  });

  it('derives windowElapsed from the row timestamps, not a wall clock', () => {
    const [item] = buildUpcomingItems([row()], NOW);
    if (item?.phase !== 'open' || item.quorum.status === 'not_published') {
      throw new Error('unreachable');
    }
    expect(item.quorum.windowElapsed).toBeCloseTo(0.8);
  });

  it('does not flag a freshly-opened proposal with no votes as at risk', () => {
    // Same 0% quorum as the at-risk fixture, but the window just opened.
    const [item] = buildUpcomingItems(
      [
        row({
          startTimestamp: new Date('2026-07-29T10:00:00.000Z'), // 2h ago
          endTimestamp: new Date('2026-08-05T12:00:00.000Z'),
          scores: [0, 0],
          scoresTotal: '0',
          votesCount: 0,
        }),
      ],
      NOW,
    );
    expect(item?.phase === 'open' && item.quorum.status).toBe('too_early_to_call');
  });

  it('maps a pending row into a not_yet_open item with NO quorum, standing or vote count', () => {
    const [item] = buildUpcomingItems(
      [
        row({
          state: 'pending',
          startTimestamp: new Date('2026-07-31T12:00:00.000Z'),
          endTimestamp: new Date('2026-08-05T12:00:00.000Z'),
          scores: null,
          scoresTotal: null,
          votesCount: 0,
        }),
      ],
      NOW,
    );
    expect(item?.phase).toBe('not_yet_open');
    if (item?.phase !== 'not_yet_open') throw new Error('unreachable');
    expect(item.opensIn).toBe('opens in 2d');
    expect(item).not.toHaveProperty('quorum');
    expect(item).not.toHaveProperty('standing');
    expect(item).not.toHaveProperty('votesCount');
  });

  it('lists open votes before not-yet-open ones regardless of row order', () => {
    const items = buildUpcomingItems(
      [
        row({ id: 'pending-1', state: 'pending', startTimestamp: new Date('2026-07-30T12:00:00.000Z') }),
        row({ id: 'active-1' }),
      ],
      NOW,
    );
    expect(items.map((i) => i.id)).toEqual(['active-1', 'pending-1']);
  });

  it('keeps a null-quorum Tally row in the list rather than dropping it', () => {
    const items = buildUpcomingItems(
      [row({ id: 'tally-1', source: 'tally', quorum: null, quorumReached: false })],
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.phase === 'open' && items[0].quorum.status).toBe('not_published');
  });

  it('survives a row whose endTimestamp equals its startTimestamp (bad data)', () => {
    const t = new Date('2026-07-29T12:00:00.000Z');
    const [item] = buildUpcomingItems([row({ startTimestamp: t, endTimestamp: t })], NOW);
    if (item?.phase !== 'open' || item.quorum.status === 'not_published') {
      throw new Error('unreachable');
    }
    expect(item.quorum.windowElapsed).toBeNull();
    expect(item.quorum.status).toBe('too_early_to_call');
  });

  it('defaults a null votesCount to 0', () => {
    const [item] = buildUpcomingItems([row({ votesCount: null })], NOW);
    expect(item?.phase === 'open' && item.votesCount).toBe(0);
  });
});

// ===========================================================================
// formatUpcomingSection
// ===========================================================================

describe('formatUpcomingSection', () => {
  it('returns an empty string for an empty list (mirrors formatCuratedNotesSection)', () => {
    expect(formatUpcomingSection([])).toBe('');
  });

  it('renders a bold bullet, an emoji header, and the no-forecast caveat', () => {
    const md = formatUpcomingSection(buildUpcomingItems([row()], NOW));
    expect(md.startsWith('\n\n## 🗳️ Open votes — quorum & standing')).toBe(true);
    expect(md).toContain('- **Fee switch activation** (snapshot) — 3d left');
    expect(md).toContain('not a forecast');
  });

  it('states the full two-part at-risk condition in the caveat, tied to the alert', () => {
    const md = formatUpcomingSection(buildUpcomingItems([row()], NOW));
    expect(md).toContain(
      '"At risk" means under 80% of quorum with under 25% of the voting window left — the same condition that raises a quorum-risk alert.',
    );
  });

  it('renders the at-risk quorum line with both halves of the condition', () => {
    const md = formatUpcomingSection(buildUpcomingItems([row()], NOW));
    expect(md).toContain(
      'Quorum: 62% of quorum (31.00M / 50.00M) — ⚠️ quorum at risk (under 80% of quorum with under 25% of the voting window left)',
    );
    expect(md).toContain('Leading: **For** — 74.2% of votes cast, +48.4 pts over "Against"');
  });

  it('renders too early to call instead of at risk early in the window', () => {
    const md = formatUpcomingSection(
      buildUpcomingItems(
        [row({ startTimestamp: new Date('2026-07-29T06:00:00.000Z'), endTimestamp: new Date('2026-08-08T12:00:00.000Z') })],
        NOW,
      ),
    );
    expect(md).toContain(
      '⏳ too early to call (under 80% of quorum, but over 25% of the voting window remains)',
    );
    expect(md).not.toContain('quorum at risk (under');
  });

  it('renders on track, and quorum met above 100%', () => {
    const onTrack = formatUpcomingSection(buildUpcomingItems([row({ scoresTotal: '45000000' })], NOW));
    expect(onTrack).toContain('— ✅ on track');

    const met = formatUpcomingSection(buildUpcomingItems([row({ scoresTotal: '62500000' })], NOW));
    expect(met).toContain('Quorum: 125% of quorum (62.50M / 50.00M) — ✅ quorum met');
  });

  it('says the quorum was not published for a Tally row and never prints 0%', () => {
    const md = formatUpcomingSection(
      buildUpcomingItems(
        [
          row({
            title: 'GIP-42: Deploy v4 on Base',
            source: 'tally',
            quorum: null,
            quorumReached: false,
            scoresTotal: '18400000',
            choices: ['For', 'Against', 'Abstain'],
            scores: [12000000, 5400000, 1000000],
          }),
        ],
        NOW,
      ),
    );
    expect(md).toContain('Quorum: ⚪ quorum not published by this source');
    // Anchored on the rendered line prefix: a bare '0% of quorum' would also
    // match the caveat's "under 8[0% of quorum]".
    expect(md).not.toContain('Quorum: 0% of quorum');
    expect(md).not.toContain('quorum at risk (under');
    expect(md).not.toContain('quorum met');
    expect(md).not.toContain('too early to call');
    // The vote standing is still real data and is still reported.
    expect(md).toContain('Leading: **For** — 65.2% of votes cast, +35.9 pts over "Against"');
  });

  it('says no votes recorded yet instead of naming a 0% leader', () => {
    const md = formatUpcomingSection(
      buildUpcomingItems([row({ scores: [0, 0], scoresTotal: '0' })], NOW),
    );
    expect(md).toContain('Standing: no votes recorded yet');
  });

  it('marks a single-choice proposal unopposed', () => {
    const md = formatUpcomingSection(
      buildUpcomingItems([row({ choices: ['Approve'], scores: [50000000], scoresTotal: '50000000' })], NOW),
    );
    expect(md).toContain('Leading: **Approve** — 100.0% of votes cast (single choice, unopposed)');
  });

  it('renders a pending proposal without any zeroed-out vote data', () => {
    const md = formatUpcomingSection(
      buildUpcomingItems(
        [
          row({
            title: 'Treasury diversification RFC',
            state: 'pending',
            startTimestamp: new Date('2026-07-31T12:00:00.000Z'),
            scores: null,
            scoresTotal: null,
          }),
        ],
        NOW,
      ),
    );
    expect(md).toContain('- **Treasury diversification RFC** (snapshot) — opens in 2d');
    expect(md).toContain('Not yet open for voting — no quorum or standing data yet');
    expect(md).not.toContain('Quorum: 0% of quorum');
    expect(md).not.toContain('no votes recorded yet');
  });

  it('appends a one-line count of stale active rows excluded by the deadline filter', () => {
    const items = buildUpcomingItems([row()], NOW);
    expect(formatUpcomingSection(items, 0)).not.toContain('excluded');
    expect(formatUpcomingSection(items, 1)).toContain(
      '_1 proposal still flagged active past its deadline was excluded — awaiting the next sync._',
    );
    expect(formatUpcomingSection(items, 3)).toContain(
      '_3 proposals still flagged active past their deadline were excluded — awaiting the next sync._',
    );
  });

  it('never emits probability/likelihood/forecast wording anywhere', () => {
    const md = formatUpcomingSection(
      buildUpcomingItems(
        [
          row(),
          row({ id: 'p2', source: 'tally', quorum: null }),
          row({ id: 'p3', startTimestamp: new Date('2026-07-29T06:00:00.000Z'), endTimestamp: new Date('2026-08-08T12:00:00.000Z') }),
          row({ id: 'p4', state: 'pending', startTimestamp: new Date('2026-07-30T12:00:00.000Z') }),
        ],
        NOW,
      ),
      2,
    );
    for (const banned of ['probability', 'likelihood', 'likely', 'chance', 'odds', 'predict', 'expected to pass']) {
      expect(md.toLowerCase()).not.toContain(banned);
    }
  });
});
