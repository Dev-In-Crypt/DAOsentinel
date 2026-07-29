import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WhaleContextItem } from '@/server/services/org-report/whale-context';

// Queue of results handed back, in order, to each `db.select()` chain. Lets
// us exercise the real fetch/join/mapping code (including the
// alerts.data->>'voter' ↔ delegates.address join, which exists nowhere else
// in the codebase) without a live database.
const { queue } = vi.hoisted(() => ({ queue: [] as unknown[][] }));

vi.mock('@/server/db', () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit']) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (value: unknown[]) => unknown) => resolve(queue.shift() ?? []);
    return chain;
  };
  return { db: { select: () => makeChain() } };
});

const {
  assessDecisiveness,
  choiceIndexFromAlert,
  deriveVpPct,
  parseWhaleAlertData,
  fetchWhaleContext,
  formatWhaleContextSection,
} = await import('@/server/services/org-report/whale-context');

beforeEach(() => {
  queue.length = 0;
});

// =============================================
// choiceIndexFromAlert — the off-by-one that would silently mis-attribute power
// =============================================

describe('choiceIndexFromAlert', () => {
  it('converts the 1-indexed alert choice to a 0-indexed scores index', () => {
    // whale-detector.ts writes `choice: vote.choice` (1-indexed) next to
    // `choiceLabel: proposal.choices[vote.choice - 1]` (0-indexed).
    expect(choiceIndexFromAlert(1)).toBe(0);
    expect(choiceIndexFromAlert(2)).toBe(1);
    expect(choiceIndexFromAlert(7)).toBe(6);
  });

  it('coerces numeric strings', () => {
    expect(choiceIndexFromAlert('3')).toBe(2);
  });

  it('rejects anything that is not a positive integer', () => {
    expect(choiceIndexFromAlert(0)).toBeNull();
    expect(choiceIndexFromAlert(-1)).toBeNull();
    expect(choiceIndexFromAlert(1.5)).toBeNull();
    expect(choiceIndexFromAlert(null)).toBeNull();
    expect(choiceIndexFromAlert(undefined)).toBeNull();
    expect(choiceIndexFromAlert('not a number')).toBeNull();
    expect(choiceIndexFromAlert({})).toBeNull();
  });
});

// =============================================
// assessDecisiveness — the arithmetic behind every claim in the section
// =============================================

describe('assessDecisiveness', () => {
  it('is DECISIVE when removing the whale flips the winner', () => {
    // "For" 60 vs "Against" 40. Whale put 30 on "For" → without them 30 < 40.
    const v = assessDecisiveness({ scores: [60, 40], choice: 1, vp: 30, votingType: 'single-choice' });
    expect(v.status).toBe('decisive');
    if (v.status === 'indeterminate') throw new Error('unreachable');
    expect(v.leaderIndex).toBe(0);
    expect(v.counterfactualLeaderIndex).toBe(1);
    expect(v.choiceIndex).toBe(0);
    expect(v.marginPct).toBeCloseTo(20); // context only, not the rule
    expect(v.vpPct).toBeCloseTo(30); // 30 / 100 — derived, not the stored vpPct
    expect(v.vp).toBe(30);
  });

  it('is NOT DECISIVE when the leader still wins without them', () => {
    const v = assessDecisiveness({ scores: [60, 40], choice: 1, vp: 10, votingType: 'single-choice' });
    expect(v.status).toBe('not_decisive');
    if (v.status === 'indeterminate') throw new Error('unreachable');
    expect(v.counterfactualLeaderIndex).toBe(0);
  });

  it('never calls a LOSING-choice whale decisive, however large their stake', () => {
    // The bug a naive `vpPct > margin` test would produce: this whale holds
    // 40% of all votes cast, far more than the 20% margin — but their power
    // sat on the losing option, so removing it only widens the lead.
    const v = assessDecisiveness({ scores: [60, 40], choice: 2, vp: 40, votingType: 'single-choice' });
    expect(v.status).toBe('not_decisive');
    if (v.status === 'indeterminate') throw new Error('unreachable');
    expect(v.vpPct).toBeCloseTo(40);
    expect(v.marginPct).toBeCloseTo(20);
    expect(v.counterfactualLeaderIndex).toBe(0);
  });

  it('leaves the leader in place when the counterfactual only ties (first max wins)', () => {
    // Removing 20 from "For" makes it 40 vs 40 — level, not overtaken.
    const v = assessDecisiveness({ scores: [60, 40], choice: 1, vp: 20, votingType: 'single-choice' });
    expect(v.status).toBe('not_decisive');
  });

  it('generalises past two choices', () => {
    // 50 / 45 / 5. Whale's 10 on choice 1 → 40 / 45 / 5, choice 2 wins.
    const v = assessDecisiveness({ scores: [50, 45, 5], choice: 1, vp: 10, votingType: 'single-choice' });
    expect(v.status).toBe('decisive');
    if (v.status === 'indeterminate') throw new Error('unreachable');
    expect(v.counterfactualLeaderIndex).toBe(1);
    expect(v.runnerUpIndex).toBe(1);
  });

  it('indexes the whale onto their OWN choice, not the neighbouring one', () => {
    // choice 2 (1-indexed) must hit scores[1]. Off by one and this whale's
    // 30 VP would be subtracted from the 10-point choice instead.
    const v = assessDecisiveness({ scores: [10, 60, 30], choice: 2, vp: 40, votingType: null });
    if (v.status === 'indeterminate') throw new Error('unreachable');
    expect(v.choiceIndex).toBe(1);
    expect(v.status).toBe('decisive'); // 60-40=20 → choice 3 (30) takes the lead
    expect(v.counterfactualLeaderIndex).toBe(2);
  });

  it('treats a null votingType as single-choice (rows synced before the column existed)', () => {
    expect(assessDecisiveness({ scores: [60, 40], choice: 1, vp: 30, votingType: null }).status).toBe(
      'decisive',
    );
    expect(assessDecisiveness({ scores: [60, 40], choice: 1, vp: 30, votingType: 'basic' }).status).toBe(
      'decisive',
    );
  });

  it('is INDETERMINATE for voting types where per-choice subtraction is meaningless', () => {
    for (const votingType of ['approval', 'ranked-choice', 'weighted', 'quadratic']) {
      expect(assessDecisiveness({ scores: [60, 40], choice: 1, vp: 30, votingType })).toEqual({
        status: 'indeterminate',
        reason: 'unsupported_voting_type',
        votingType,
      });
    }
  });

  it('is INDETERMINATE, not a default verdict, when scores are missing or empty', () => {
    const base = { choice: 1, vp: 30, votingType: 'single-choice' } as const;
    expect(assessDecisiveness({ ...base, scores: null })).toEqual({
      status: 'indeterminate',
      reason: 'missing_scores',
    });
    expect(assessDecisiveness({ ...base, scores: undefined })).toEqual({
      status: 'indeterminate',
      reason: 'missing_scores',
    });
    expect(assessDecisiveness({ ...base, scores: [] })).toEqual({
      status: 'indeterminate',
      reason: 'missing_scores',
    });
    // Sum of zero — nothing has been voted on yet.
    expect(assessDecisiveness({ ...base, scores: [0, 0] })).toEqual({
      status: 'indeterminate',
      reason: 'missing_scores',
    });
  });

  it('is INDETERMINATE with a single choice — nothing to flip to', () => {
    expect(
      assessDecisiveness({ scores: [100], choice: 1, vp: 30, votingType: 'single-choice' }),
    ).toEqual({ status: 'indeterminate', reason: 'insufficient_choices' });
  });

  it('is INDETERMINATE when the recorded choice does not index into scores', () => {
    const base = { scores: [60, 40], vp: 30, votingType: 'single-choice' };
    expect(assessDecisiveness({ ...base, choice: 3 })).toEqual({
      status: 'indeterminate',
      reason: 'choice_out_of_range',
    });
    expect(assessDecisiveness({ ...base, choice: 0 })).toEqual({
      status: 'indeterminate',
      reason: 'choice_out_of_range',
    });
    expect(assessDecisiveness({ ...base, choice: null })).toEqual({
      status: 'indeterminate',
      reason: 'choice_out_of_range',
    });
  });

  it('is INDETERMINATE when the alert never recorded absolute voting power', () => {
    const base = { scores: [60, 40], choice: 1, votingType: 'single-choice' };
    expect(assessDecisiveness({ ...base, vp: null })).toEqual({
      status: 'indeterminate',
      reason: 'missing_vp',
    });
    expect(assessDecisiveness({ ...base, vp: 0 })).toEqual({
      status: 'indeterminate',
      reason: 'missing_vp',
    });
  });

  it('stays conservative when scores were resynced below the recorded vp', () => {
    // vp exceeds their own choice's current total → subtraction goes negative,
    // which can only make a flip more likely, never less. Must not throw.
    const v = assessDecisiveness({ scores: [60, 40], choice: 1, vp: 500, votingType: null });
    expect(v.status).toBe('decisive');
    if (v.status === 'indeterminate') throw new Error('unreachable');
    expect(v.vpPct).toBe(100); // clamped
  });
});

describe('deriveVpPct', () => {
  it('measures vp against the CURRENT sum of scores', () => {
    expect(deriveVpPct([60, 40], 25)).toBeCloseTo(25);
    expect(deriveVpPct([300, 100], 100)).toBeCloseTo(25);
  });

  it('returns null rather than a misleading zero when it cannot be derived', () => {
    expect(deriveVpPct(null, 25)).toBeNull();
    expect(deriveVpPct([], 25)).toBeNull();
    expect(deriveVpPct([0, 0], 25)).toBeNull();
    expect(deriveVpPct([60, 40], null)).toBeNull();
    expect(deriveVpPct([60, 40], 0)).toBeNull();
  });
});

// =============================================
// parseWhaleAlertData — untyped jsonb, defensively narrowed
// =============================================

describe('parseWhaleAlertData', () => {
  const empty = {
    voter: null,
    vp: null,
    vpPct: null,
    choice: null,
    choiceLabel: null,
    proposalTitle: null,
  };

  it('reads a well-formed whale_vote payload', () => {
    expect(
      parseWhaleAlertData({
        voter: '0xabcdef0123456789abcdef0123456789abcdef01',
        vp: 1250000,
        vpPct: 10.5,
        choice: 1,
        choiceLabel: 'For',
        proposalTitle: 'Fund the grants program',
        proposalId: 'external-id-not-a-uuid',
      }),
    ).toEqual({
      voter: '0xabcdef0123456789abcdef0123456789abcdef01',
      vp: 1250000,
      vpPct: 10.5,
      choice: 1, // preserved 1-indexed; conversion happens in choiceIndexFromAlert
      choiceLabel: 'For',
      proposalTitle: 'Fund the grants program',
    });
  });

  it('lowercases the voter address — it is the delegates join key', () => {
    expect(parseWhaleAlertData({ voter: '0xABCDEF01' }).voter).toBe('0xabcdef01');
  });

  it('returns all-null for malformed jsonb rather than throwing', () => {
    expect(parseWhaleAlertData(null)).toEqual(empty);
    expect(parseWhaleAlertData(undefined)).toEqual(empty);
    expect(parseWhaleAlertData('not an object')).toEqual(empty);
    expect(parseWhaleAlertData([1, 2, 3])).toEqual(empty);
    expect(parseWhaleAlertData({})).toEqual(empty);
  });

  it('rejects wrong-typed and blank fields', () => {
    expect(
      parseWhaleAlertData({
        voter: '   ',
        vp: 'not a number',
        vpPct: {},
        choice: [],
        choiceLabel: 42,
        proposalTitle: null,
      }),
    ).toEqual(empty);
  });

  it('coerces numeric strings', () => {
    const parsed = parseWhaleAlertData({ vp: '1250000', vpPct: '10.5', choice: '2' });
    expect(parsed.vp).toBe(1250000);
    expect(parsed.vpPct).toBe(10.5);
    expect(parsed.choice).toBe(2);
  });
});

// =============================================
// fetchWhaleContext — the join that has never been made before
// =============================================

const WHALE = '0xabcdef0123456789abcdef0123456789abcdef01';

function alertRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-uuid-1',
    createdAt: new Date('2026-07-20T00:00:00Z'),
    data: {
      voter: WHALE,
      vp: 30,
      vpPct: 10.5, // deliberately stale vs the scores below
      choice: 1,
      choiceLabel: 'For',
      proposalTitle: 'Fund the grants program',
      proposalId: 'snapshot-external-id',
    },
    proposalId: 'proposal-uuid-1',
    proposalTitle: 'Fund the grants program',
    proposalState: 'closed',
    votingType: 'single-choice',
    choices: ['For', 'Against'],
    scores: [60, 40],
    ...overrides,
  };
}

describe('fetchWhaleContext', () => {
  it('enriches a whale who IS a known delegate', async () => {
    queue.push([alertRow()]);
    queue.push([
      {
        address: WHALE,
        name: 'Grants Guild',
        ensName: 'grantsguild.eth',
        // numeric columns arrive from pg as strings
        karmaScore: '82.50',
        karmaRank: 14,
        karmaUrl: 'https://karmahq.xyz/x',
        participationRate: '0.9100',
        totalVotesCast: 340,
        totalDaosActive: 6,
        daoVotingPower: '1200000',
      },
    ]);

    const [item] = await fetchWhaleContext('dao-uuid', new Date('2026-07-22T00:00:00Z'));

    expect(item?.voter).toBe(WHALE);
    // The uuid column, never data.proposalId (which holds the external id).
    expect(item?.proposalId).toBe('proposal-uuid-1');
    expect(item?.delegate).toEqual({
      address: WHALE,
      displayName: 'grantsguild.eth',
          isPubliclyIdentified: true, // ensName wins over name
      karmaScore: 82.5,
      karmaRank: 14,
      karmaUrl: 'https://karmahq.xyz/x',
      participationRate: 0.91,
      totalVotesCast: 340,
      totalDaosActive: 6,
      daoVotingPower: 1200000,
    });
    // Stale alert-time pct kept separately from the freshly derived one.
    expect(item?.vpPctAtAlert).toBe(10.5);
    expect(item?.vpPctOfScores).toBeCloseTo(30);
    expect(item?.decisiveness.status).toBe('decisive');
  });

  it('leaves delegate null when the whale is NOT in the delegates table', async () => {
    queue.push([alertRow()]);
    queue.push([]); // no matching delegates row — a first-time large holder

    const [item] = await fetchWhaleContext('dao-uuid');

    expect(item?.voter).toBe(WHALE);
    expect(item?.delegate).toBeNull();
    // Still gets a full impact verdict — identity and decisiveness are independent.
    expect(item?.decisiveness.status).toBe('decisive');
  });

  it('falls back to the shortened address when a delegate has no name or ENS', async () => {
    queue.push([alertRow()]);
    queue.push([
      {
        address: WHALE,
        name: null,
        ensName: null,
        karmaScore: null,
        karmaRank: null,
        karmaUrl: null,
        participationRate: null,
        totalVotesCast: 0,
        totalDaosActive: 0,
        daoVotingPower: null,
      },
    ]);

    const [item] = await fetchWhaleContext('dao-uuid');
    expect(item?.delegate?.displayName).toBe('0xabcd…ef01');
  });

  it('survives a malformed data jsonb and skips the delegate lookup entirely', async () => {
    queue.push([alertRow({ data: 'not an object' })]);
    // No second result queued: with no parseable voter there is nothing to look up.

    const [item] = await fetchWhaleContext('dao-uuid');

    expect(item?.voter).toBeNull();
    expect(item?.delegate).toBeNull();
    expect(item?.vp).toBeNull();
    expect(item?.vpPctAtAlert).toBeNull();
    expect(item?.vpPctOfScores).toBeNull();
    // Title still recovered from the joined proposal row.
    expect(item?.proposalTitle).toBe('Fund the grants program');
    expect(item?.decisiveness).toEqual({ status: 'indeterminate', reason: 'choice_out_of_range' });
  });

  it('handles an alert whose proposal row is gone (left join)', async () => {
    queue.push([
      alertRow({
        proposalId: null,
        proposalTitle: null,
        proposalState: null,
        votingType: null,
        choices: null,
        scores: null,
      }),
    ]);
    queue.push([]);

    const [item] = await fetchWhaleContext('dao-uuid');
    expect(item?.choices).toEqual([]);
    // Falls back to the title snapshotted in the alert payload.
    expect(item?.proposalTitle).toBe('Fund the grants program');
    expect(item?.decisiveness).toEqual({ status: 'indeterminate', reason: 'missing_scores' });
  });

  it('returns an empty array when there are no whale alerts', async () => {
    queue.push([]);
    await expect(fetchWhaleContext('dao-uuid')).resolves.toEqual([]);
  });
});

// =============================================
// formatWhaleContextSection — pure markdown
// =============================================

function item(overrides: Partial<WhaleContextItem> = {}): WhaleContextItem {
  return {
    alertId: 'alert-uuid-1',
    createdAt: new Date('2026-07-20T00:00:00Z'),
    voter: WHALE,
    vp: 30,
    vpPctAtAlert: 10.5,
    vpPctOfScores: 30,
    choiceLabel: 'For',
    proposalTitle: 'Fund the grants program',
    proposalId: 'proposal-uuid-1',
    proposalState: 'closed',
    votingType: 'single-choice',
    choices: ['For', 'Against'],
    delegate: null,
    decisiveness: assessDecisiveness({
      scores: [60, 40],
      choice: 1,
      vp: 30,
      votingType: 'single-choice',
    }),
    ...overrides,
  };
}

describe('formatWhaleContextSection', () => {
  it('returns an empty string when there are no whale alerts', () => {
    expect(formatWhaleContextSection([])).toBe('');
  });

  it('renders a known delegate with reputation metrics', () => {
    const md = formatWhaleContextSection([
      item({
        delegate: {
          address: WHALE,
          displayName: 'grantsguild.eth',
          isPubliclyIdentified: true,
          karmaScore: 82.5,
          karmaRank: 14,
          karmaUrl: null,
          participationRate: 0.91,
          totalVotesCast: 340,
          totalDaosActive: 6,
          daoVotingPower: 1200000,
        },
      }),
    ]);

    expect(md).toContain('## 🐳 Whale & delegate context');
    expect(md).toContain('- **grantsguild.eth** — cast 30.0% of votes cast for "For"');
    expect(md).toContain('Known delegate — Karma 82.5 (rank #14)');
    expect(md).toContain('91% participation');
    expect(md).toContain('340 votes cast');
    expect(md).toContain('1.20M VP here');
  });

  // Regression guard from the live Aavegotchi run: every whale rendered as
  // "Known delegate" purely because `rebuildDelegateProfiles` creates a row
  // for any frequent voter. `displayName` can't distinguish the two cases —
  // it falls back to the shortened address and so is never null.
  it('does not call a delegate "known" without an ENS/display name or Karma profile', () => {
    const md = formatWhaleContextSection([
      item({
        delegate: {
          address: WHALE,
          displayName: '0xabcd…ef01',
          isPubliclyIdentified: false,
          karmaScore: null,
          karmaRank: null,
          karmaUrl: null,
          participationRate: 1,
          totalVotesCast: 17,
          totalDaosActive: 1,
          daoVotingPower: 141460,
        },
      }),
    ]);
    expect(md).not.toContain('Known delegate');
    expect(md).toContain('Recurring voter we track — no public delegate identity');
    // The metrics we DO have are still shown — this is a labelling fix, not a
    // reason to withhold data.
    expect(md).toContain('17 votes cast');
  });

  it('says plainly that an unknown wallet has no profile, with no blank metrics', () => {
    const md = formatWhaleContextSection([item()]);
    expect(md).toContain('- **0xabcd…ef01** —');
    expect(md).toContain("No delegate profile — address not seen in this DAO's delegate set.");
    expect(md).not.toContain('Karma');
    expect(md).not.toContain('participation');
  });

  it('states the decisive case with the counterfactual shown', () => {
    const md = formatWhaleContextSection([item()]);
    expect(md).toContain(
      '⚠️ **Decisive** — take their 30.0% of votes cast (30 VP) back off "For" and the winner flips from "For" to "Against". Top-two margin: 20.0% over "Against".',
    );
  });

  it('states plainly that a non-decisive vote changed nothing', () => {
    const md = formatWhaleContextSection([
      item({
        vp: 10,
        vpPctOfScores: 10,
        decisiveness: assessDecisiveness({
          scores: [60, 40],
          choice: 1,
          vp: 10,
          votingType: 'single-choice',
        }),
      }),
    ]);
    expect(md).toContain(
      '✅ **Not decisive** — "For" still wins without their 10.0% of votes cast (10 VP) on "For"; the outcome would not have changed.',
    );
  });

  it('admits when impact cannot be determined instead of guessing', () => {
    const missingScores = formatWhaleContextSection([
      item({
        vpPctOfScores: null,
        decisiveness: assessDecisiveness({
          scores: null,
          choice: 1,
          vp: 30,
          votingType: 'single-choice',
        }),
      }),
    ]);
    expect(missingScores).toContain(
      '❔ **Impact undetermined** — no per-choice results recorded for this proposal.',
    );
    expect(missingScores).not.toContain('Decisive');
    // Falls back to the alert-time percentage, explicitly labelled as such.
    expect(missingScores).toContain('10.5% of total voting power (as recorded when the alert fired)');

    const singleChoice = formatWhaleContextSection([
      item({
        choices: ['For'],
        decisiveness: assessDecisiveness({
          scores: [100],
          choice: 1,
          vp: 30,
          votingType: 'single-choice',
        }),
      }),
    ]);
    expect(singleChoice).toContain(
      '❔ **Impact undetermined** — the proposal has fewer than two choices, so there was no alternative outcome to flip to.',
    );
  });

  it('names the unsupported voting type rather than hiding behind a generic message', () => {
    const md = formatWhaleContextSection([
      item({
        votingType: 'approval',
        decisiveness: assessDecisiveness({
          scores: [60, 40],
          choice: 1,
          vp: 30,
          votingType: 'approval',
        }),
      }),
    ]);
    expect(md).toContain(
      "❔ **Impact undetermined** — voting type 'approval' — subtracting one voter's power from a single choice isn't meaningful here.",
    );
  });

  it('degrades gracefully when the alert payload was malformed', () => {
    const md = formatWhaleContextSection([
      item({
        voter: null,
        vp: null,
        vpPctAtAlert: null,
        vpPctOfScores: null,
        choiceLabel: null,
        proposalTitle: null,
        choices: [],
        decisiveness: { status: 'indeterminate', reason: 'choice_out_of_range' },
      }),
    ]);
    expect(md).toContain('- **Unknown address** — cast an unrecorded share of voting power');
    expect(md).toContain(
      "❔ **Impact undetermined** — the alert's recorded choice doesn't line up with the proposal's choices.",
    );
  });

  it('names choices by index even when the labels are missing', () => {
    const md = formatWhaleContextSection([item({ choices: [] })]);
    expect(md).toContain('back off "choice 1" and the winner flips from "choice 1" to "choice 2"');
  });
});
