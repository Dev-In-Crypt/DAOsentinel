import { describe, it, expect } from 'vitest';
import {
  MATERIAL_NEGATIVE_CONTRIBUTION,
  RECOMMENDATION_LIMIT,
  buildRecommendations,
  formatRecommendationsSection,
  type Recommendation,
  type RecommendationInput,
} from '@/server/services/org-report/recommendations';
import { QUORUM_NOT_PUBLISHED_REASON } from '@/server/services/org-report/upcoming-quorum';
import type { UpcomingProposalItem } from '@/server/services/org-report/upcoming-quorum';
import type {
  Decisiveness,
  WhaleContextItem,
  WhaleDelegateProfile,
} from '@/server/services/org-report/whale-context';
import type { AttentionAlert } from '@/server/services/org-report/attention-alerts';
import type {
  AttributedScoreChange,
  MetricContribution,
  ScoreMetric,
} from '@/server/services/org-report/score-attribution';

const NOW = new Date('2026-07-29T12:00:00.000Z');
const IN_3_DAYS = new Date('2026-08-01T12:00:00.000Z');
const IN_30_DAYS = new Date('2026-08-28T12:00:00.000Z');
const YESTERDAY = new Date('2026-07-28T12:00:00.000Z');

// ===========================================================================
// Fixtures — minimal by default, so each test overrides only its own trigger
// ===========================================================================

type OpenItem = Extract<UpcomingProposalItem, { phase: 'open' }>;

/** An open vote comfortably on track: no rule fires on it unless overridden. */
function openItem(overrides: Partial<OpenItem> = {}): OpenItem {
  return {
    phase: 'open',
    id: 'p1',
    title: 'Fee switch activation',
    source: 'snapshot',
    endTimestamp: IN_3_DAYS,
    votesCount: 412,
    quorum: {
      status: 'on_track',
      pct: 92,
      scoresTotal: 46_000_000,
      quorum: 50_000_000,
      windowElapsed: 0.8,
    },
    standing: null,
    timeLeft: '3d left',
    ...overrides,
  };
}

/** The same vote, short of quorum in the final stretch. */
function atRiskItem(overrides: Partial<OpenItem> = {}): OpenItem {
  return openItem({
    quorum: {
      status: 'at_risk',
      pct: 62,
      scoresTotal: 31_000_000,
      quorum: 50_000_000,
      windowElapsed: 0.8,
    },
    ...overrides,
  });
}

/** A Tally-sourced vote: `tally-sync.ts` writes `quorum: null` for every one. */
function notPublishedItem(overrides: Partial<OpenItem> = {}): OpenItem {
  return openItem({
    id: 'p-tally',
    title: 'Treasury diversification',
    source: 'tally',
    quorum: { status: 'not_published', reason: QUORUM_NOT_PUBLISHED_REASON },
    ...overrides,
  });
}

function delegateProfile(overrides: Partial<WhaleDelegateProfile> = {}): WhaleDelegateProfile {
  return {
    address: '0xaaaabbbbccccddddeeeeffff0000111122223333',
    displayName: 'gauntlet.eth',
    karmaScore: 88.4,
    karmaRank: 3,
    karmaUrl: null,
    participationRate: 0.91,
    totalVotesCast: 240,
    totalDaosActive: 12,
    daoVotingPower: 1_200_000,
    ...overrides,
  };
}

const DECISIVE: Decisiveness = {
  status: 'decisive',
  leaderIndex: 0,
  counterfactualLeaderIndex: 1,
  choiceIndex: 0,
  runnerUpIndex: 1,
  marginPct: 4.2,
  vpPct: 12.3,
  vp: 1_200_000,
};

const NOT_DECISIVE: Decisiveness = { ...DECISIVE, status: 'not_decisive', counterfactualLeaderIndex: 0 };

function whale(overrides: Partial<WhaleContextItem> = {}): WhaleContextItem {
  return {
    alertId: 'a-whale-1',
    createdAt: YESTERDAY,
    voter: '0xaaaabbbbccccddddeeeeffff0000111122223333',
    vp: 1_200_000,
    vpPctAtAlert: 12.1,
    vpPctOfScores: 12.3,
    choiceLabel: 'For',
    proposalTitle: 'Fee switch activation',
    proposalId: 'p1',
    proposalState: 'active',
    votingType: 'single-choice',
    choices: ['For', 'Against'],
    delegate: delegateProfile(),
    decisiveness: DECISIVE,
    ...overrides,
  };
}

function alert(overrides: Partial<AttentionAlert> = {}): AttentionAlert {
  return {
    id: 'al-1',
    type: 'last_minute_swing',
    severity: 'warning',
    title: '⚡ Vote swing detected on Fee switch activation',
    whatHappened: 'The leading choice changed in the final hours of voting.',
    whyItMatters: 'Late flips produce outcomes the community did not expect.',
    participants: 'Leading choice flipped from "For" to "Against"',
    deadline: IN_3_DAYS,
    proposalTitle: 'Fee switch activation',
    createdAt: YESTERDAY,
    ...overrides,
  };
}

function driver(metric: ScoreMetric, contribution: number, overrides: Partial<MetricContribution> = {}): MetricContribution {
  return {
    metric,
    label: '',
    hint: '',
    previous: 62,
    current: 54,
    delta: -8,
    contribution,
    ...overrides,
  };
}

function attributed(drivers: MetricContribution[], overrides: Partial<AttributedScoreChange> = {}): AttributedScoreChange {
  return {
    status: 'attributed',
    period: {
      currentComputedAt: new Date('2026-07-29T00:00:00.000Z'),
      baselineComputedAt: new Date('2026-07-22T00:00:00.000Z'),
      ageDays: 7,
      coversFullWeek: true,
    },
    previousScore: 71,
    currentScore: 64,
    scoreDelta: -7,
    attributedDelta: -7,
    residual: 0,
    drivers,
    ...overrides,
  };
}

/** Convenience: which rules fired, in output order. */
function ruleIds(recs: Recommendation[]): string[] {
  return recs.map((r) => r.ruleId);
}

// ===========================================================================
// Rule: quorum_push
// ===========================================================================

describe('rule: quorum_push', () => {
  it('fires on an open proposal flagged at_risk, naming quorum, shortfall and time left', () => {
    const recs = buildRecommendations({ upcoming: [atRiskItem()] }, NOW);

    expect(ruleIds(recs)).toEqual(['quorum_push']);
    const rec = recs[0];
    expect(rec.priority).toBe('high');
    expect(rec.subject).toBe('p1');
    expect(rec.deadline).toEqual(IN_3_DAYS);
    expect(rec.action).toContain('Fee switch activation');
    // The shortfall is 50M - 31M = 19M.
    expect(rec.action).toContain('19.00M');
    expect(rec.evidence).toContain('62% of quorum');
    expect(rec.evidence).toContain('31.00M of 50.00M');
    expect(rec.evidence).toContain('3d left');
  });

  it('does not fire on on_track, met, too_early_to_call or not_yet_open items', () => {
    const quiet: UpcomingProposalItem[] = [
      openItem(),
      openItem({
        id: 'p2',
        quorum: { status: 'met', pct: 140, scoresTotal: 70_000_000, quorum: 50_000_000, windowElapsed: 0.9 },
      }),
      openItem({
        id: 'p3',
        quorum: { status: 'too_early_to_call', pct: 12, scoresTotal: 6_000_000, quorum: 50_000_000, windowElapsed: 0.1 },
      }),
      {
        phase: 'not_yet_open',
        id: 'p4',
        title: 'Not open yet',
        source: 'snapshot',
        startTimestamp: IN_3_DAYS,
        endTimestamp: IN_30_DAYS,
        opensIn: 'opens in 3d',
      },
    ];

    expect(ruleIds(buildRecommendations({ upcoming: quiet }, NOW))).toEqual(['no_action_needed']);
  });

  it('ignores an at_risk proposal whose deadline has already passed at `now`', () => {
    const closed = atRiskItem({ id: 'p-old', endTimestamp: YESTERDAY });
    expect(ruleIds(buildRecommendations({ upcoming: [closed] }, NOW))).toEqual(['no_action_needed']);
  });
});

// ===========================================================================
// Rule: confirm_quorum_manually
// ===========================================================================

describe('rule: confirm_quorum_manually', () => {
  it('fires on a not_published quorum with a near deadline', () => {
    const recs = buildRecommendations({ upcoming: [notPublishedItem()] }, NOW);

    expect(ruleIds(recs)).toEqual(['confirm_quorum_manually']);
    expect(recs[0].priority).toBe('medium');
    expect(recs[0].evidence).toContain(QUORUM_NOT_PUBLISHED_REASON);
    expect(recs[0].evidence).toContain('Treasury diversification');
    expect(recs[0].evidence).toContain('2026-08-01');
    expect(recs[0].deadline).toEqual(IN_3_DAYS);
  });

  it('stays quiet when the same proposal closes well beyond the report horizon', () => {
    const far = notPublishedItem({ endTimestamp: IN_30_DAYS, timeLeft: '30d left' });
    expect(ruleIds(buildRecommendations({ upcoming: [far] }, NOW))).toEqual(['no_action_needed']);
  });
});

// ===========================================================================
// Rule: review_quorum_threshold
// ===========================================================================

describe('rule: review_quorum_threshold', () => {
  it('does not fire on a single at-risk proposal', () => {
    expect(ruleIds(buildRecommendations({ upcoming: [atRiskItem()] }, NOW))).toEqual(['quorum_push']);
  });

  it('fires once when two proposals are at risk in the same week, listing both', () => {
    const recs = buildRecommendations(
      { upcoming: [atRiskItem(), atRiskItem({ id: 'p2', title: 'Grants round 7' })] },
      NOW,
    );

    const threshold = recs.filter((r) => r.ruleId === 'review_quorum_threshold');
    expect(threshold).toHaveLength(1);
    expect(threshold[0].priority).toBe('low');
    expect(threshold[0].deadline).toBeNull();
    expect(threshold[0].evidence).toContain('Fee switch activation');
    expect(threshold[0].evidence).toContain('Grants round 7');
    expect(threshold[0].evidence).toContain('2 open proposals are');
  });
});

// ===========================================================================
// Rules: contact_decisive_delegate / identify_decisive_whale
// ===========================================================================

describe('rules: decisive whales', () => {
  it('recommends contacting a decisive whale that has a delegate profile', () => {
    const recs = buildRecommendations({ upcoming: [openItem()], whales: [whale()] }, NOW);

    expect(ruleIds(recs)).toEqual(['contact_decisive_delegate']);
    const rec = recs[0];
    expect(rec.priority).toBe('high');
    expect(rec.action).toContain('gauntlet.eth');
    expect(rec.action).toContain('Fee switch activation');
    // The deadline is joined from the upcoming section, not invented here.
    expect(rec.deadline).toEqual(IN_3_DAYS);
    expect(rec.evidence).toContain('12.3% of votes cast');
    expect(rec.evidence).toContain('1.20M VP');
    expect(rec.evidence).toContain('flips the winner from "For" to "Against"');
  });

  it('recommends identifying a decisive whale with no delegate profile', () => {
    const recs = buildRecommendations(
      { upcoming: [openItem()], whales: [whale({ delegate: null })] },
      NOW,
    );

    expect(ruleIds(recs)).toEqual(['identify_decisive_whale']);
    expect(recs[0].priority).toBe('medium');
    expect(recs[0].action).toContain('0xaaaa…3333');
    expect(recs[0].evidence).toContain('No delegate profile exists');
  });

  it('stays quiet for a not-decisive whale, an indeterminate verdict, or a closed proposal', () => {
    const cases: WhaleContextItem[][] = [
      [whale({ decisiveness: NOT_DECISIVE })],
      [whale({ decisiveness: { status: 'indeterminate', reason: 'missing_scores' } })],
      [whale({ proposalState: 'closed' })],
    ];

    for (const whales of cases) {
      expect(ruleIds(buildRecommendations({ upcoming: [openItem()], whales }, NOW))).toEqual([
        'no_action_needed',
      ]);
    }
  });

  it('leaves the deadline null when the proposal is not in the open-votes list', () => {
    const recs = buildRecommendations({ whales: [whale()] }, NOW);
    expect(recs[0].deadline).toBeNull();
    expect(recs[0].action).toContain('before voting closes');
  });
});

// ===========================================================================
// Rules: alert-driven
// ===========================================================================

describe('rules: alert-driven', () => {
  it('prepares comms for a last_minute_swing alert', () => {
    const recs = buildRecommendations({ alerts: [alert()] }, NOW);

    expect(ruleIds(recs)).toEqual(['prepare_swing_comms']);
    expect(recs[0].priority).toBe('medium');
    expect(recs[0].action).toContain('Fee switch activation');
    expect(recs[0].evidence).toContain('⚡ Vote swing detected');
    expect(recs[0].evidence).toContain('flipped from "For" to "Against"');
  });

  it('investigates a coordinated_voting alert, escalating to high when critical', () => {
    const warning = buildRecommendations(
      {
        alerts: [
          alert({
            id: 'al-2',
            type: 'coordinated_voting',
            title: '🕸️ Coordinated voting on Grants round 7',
            proposalTitle: 'Grants round 7',
            participants: '4 addresses: 0x1111…1111, 0x2222…2222 — all voted "For"',
          }),
        ],
      },
      NOW,
    );
    expect(ruleIds(warning)).toEqual(['investigate_coordination']);
    expect(warning[0].priority).toBe('medium');
    expect(warning[0].evidence).toContain('4 addresses');

    const critical = buildRecommendations(
      { alerts: [alert({ id: 'al-3', type: 'coordinated_voting', severity: 'critical' })] },
      NOW,
    );
    expect(critical[0].priority).toBe('high');
  });

  it('ignores alert types that have no defined action', () => {
    const ignored = ['whale_vote', 'quorum_risk', 'score_drop', 'something_new'].map((type, i) =>
      alert({ id: `al-${i}`, type }),
    );
    expect(ruleIds(buildRecommendations({ alerts: ignored }, NOW))).toEqual(['no_action_needed']);
  });
});

// ===========================================================================
// Rule: review_score_metric
// ===========================================================================

describe('rule: review_score_metric', () => {
  it('fires on a materially negative contribution and uses the shared metric label/hint', () => {
    const recs = buildRecommendations(
      { attribution: attributed([driver('participation', -2)]) },
      NOW,
    );

    expect(ruleIds(recs)).toEqual(['review_score_metric']);
    expect(recs[0].priority).toBe('medium');
    expect(recs[0].subject).toBe('participation');
    expect(recs[0].deadline).toBeNull();
    // Label and hint come from METRIC_LABEL / METRIC_HINT even when the driver
    // carried empty strings.
    expect(recs[0].evidence).toContain('Voter participation fell 8.00 points (62 → 54)');
    expect(recs[0].evidence).toContain('between 2026-07-22 and 2026-07-29');
    expect(recs[0].evidence).toContain('-2.00 off the -7.00 Democracy Score move');
    expect(recs[0].evidence).toContain('Avg voters per recent proposal');
    expect(recs[0].action).toContain('turnout push');
  });

  it('gives each axis its own action', () => {
    const recs = buildRecommendations(
      {
        attribution: attributed([
          driver('powerDistribution', -1.5),
          driver('delegateAccountability', -0.9),
        ]),
      },
      NOW,
    );

    const byMetric = new Map(recs.map((r) => [r.subject, r.action]));
    expect(byMetric.get('powerDistribution')).toContain('delegation concentration');
    expect(byMetric.get('delegateAccountability')).toContain('redelegate');
  });

  it('ignores positive, zero and sub-threshold contributions', () => {
    const recs = buildRecommendations(
      {
        attribution: attributed([
          driver('participation', 3),
          driver('proposalDiversity', 0),
          driver('manipulationResistance', -(MATERIAL_NEGATIVE_CONTRIBUTION - 0.01)),
        ]),
      },
      NOW,
    );
    expect(ruleIds(recs)).toEqual(['no_action_needed']);
  });

  it('never fires on an unavailable attribution, whatever the reason', () => {
    const reasons = [
      'no_current_snapshot',
      'no_current_breakdown',
      'first_period',
      'metrics_missing',
      'residual_exceeds_tolerance',
    ] as const;

    for (const reason of reasons) {
      const recs = buildRecommendations({ attribution: { status: 'unavailable', reason } }, NOW);
      expect(ruleIds(recs)).toEqual(['no_action_needed']);
    }
  });
});

// ===========================================================================
// Traceability — the contract the whole module exists to keep
// ===========================================================================

/** A deliberately noisy week that fires every rule at least once. */
function busyWeek(): RecommendationInput {
  return {
    upcoming: [
      atRiskItem(),
      atRiskItem({ id: 'p2', title: 'Grants round 7', endTimestamp: new Date('2026-07-31T12:00:00.000Z'), timeLeft: '2d left' }),
      notPublishedItem(),
      openItem({ id: 'p9', title: 'Healthy vote' }),
    ],
    whales: [
      whale(),
      whale({ alertId: 'a-whale-2', voter: '0x9999888877776666555544443333222211110000', delegate: null }),
    ],
    alerts: [
      alert(),
      alert({
        id: 'al-2',
        type: 'coordinated_voting',
        severity: 'critical',
        title: '🕸️ Coordinated voting on Grants round 7',
        proposalTitle: 'Grants round 7',
        participants: '4 addresses: 0x1111…1111, 0x2222…2222 — all voted "For"',
        deadline: new Date('2026-07-31T12:00:00.000Z'),
      }),
    ],
    attribution: attributed([driver('participation', -2), driver('powerDistribution', -1.2)]),
  };
}

describe('traceability', () => {
  it('gives every generated recommendation a rule id and non-empty evidence', () => {
    const inputs: RecommendationInput[] = [
      busyWeek(),
      {},
      { upcoming: [atRiskItem()] },
      { upcoming: [notPublishedItem()] },
      { whales: [whale()] },
      { whales: [whale({ delegate: null })] },
      { alerts: [alert()] },
      { alerts: [alert({ type: 'coordinated_voting', severity: 'critical' })] },
      { attribution: attributed([driver('manipulationResistance', -3)]) },
      { upcoming: [atRiskItem(), atRiskItem({ id: 'p2', title: 'Grants round 7' })] },
    ];

    for (const input of inputs) {
      const recs = buildRecommendations(input, NOW);
      expect(recs.length).toBeGreaterThan(0);
      for (const rec of recs) {
        expect(rec.ruleId).toBeTruthy();
        expect(rec.subject.trim()).not.toBe('');
        expect(rec.action.trim()).not.toBe('');
        // The load-bearing assertion: no recommendation without its trigger.
        expect(rec.evidence.trim()).not.toBe('');
        expect(rec.evidence.length).toBeGreaterThan(20);
      }
    }
  });

  it('names the concrete subject inside the evidence of every busy-week item', () => {
    for (const rec of buildRecommendations(busyWeek(), NOW)) {
      // Proposal title, address, or metric label — always something the
      // customer can look up in another section of the same report.
      const mentionsSomethingConcrete =
        /"[^"]+"/.test(rec.evidence) || /0x[0-9a-f]{4}…/i.test(rec.evidence);
      expect(mentionsSomethingConcrete).toBe(true);
    }
  });
});

// ===========================================================================
// Dedupe
// ===========================================================================

describe('dedupe', () => {
  it('collapses duplicate rows for the same rule and subject', () => {
    const recs = buildRecommendations(
      // A resynced alert can genuinely produce two whale rows for one voter on
      // one proposal, and two duplicate upcoming rows would both be at risk.
      { upcoming: [atRiskItem(), atRiskItem()], whales: [whale(), whale({ alertId: 'a-whale-dup' })] },
      NOW,
    );

    expect(ruleIds(recs)).toEqual(['quorum_push', 'contact_decisive_delegate']);
  });

  it('does not let one proposal listed twice trigger the threshold review', () => {
    // Two rows, one incident — the threshold rule claims "N different votes".
    const recs = buildRecommendations({ upcoming: [atRiskItem(), atRiskItem()] }, NOW);
    expect(ruleIds(recs)).toEqual(['quorum_push']);
  });

  it('keeps two different whales on the same proposal as two separate actions', () => {
    const recs = buildRecommendations(
      {
        upcoming: [openItem()],
        whales: [
          whale(),
          whale({
            alertId: 'a-whale-2',
            voter: '0x9999888877776666555544443333222211110000',
            delegate: delegateProfile({
              address: '0x9999888877776666555544443333222211110000',
              displayName: 'blockchain-at-berkeley.eth',
            }),
          }),
        ],
      },
      NOW,
    );

    expect(recs).toHaveLength(2);
    expect(new Set(recs.map((r) => r.subject)).size).toBe(2);
  });
});

// ===========================================================================
// Ordering, determinism, cap
// ===========================================================================

describe('ordering and determinism', () => {
  it('returns byte-identical output when run twice on identical input', () => {
    const first = buildRecommendations(busyWeek(), NOW);
    const second = buildRecommendations(busyWeek(), NOW);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('does not depend on the order the inputs arrive in', () => {
    const input = busyWeek();
    const reversed: RecommendationInput = {
      upcoming: [...(input.upcoming ?? [])].reverse(),
      whales: [...(input.whales ?? [])].reverse(),
      alerts: [...(input.alerts ?? [])].reverse(),
      attribution: input.attribution,
    };
    expect(buildRecommendations(reversed, NOW)).toEqual(buildRecommendations(input, NOW));
  });

  it('orders by priority, then soonest deadline', () => {
    const recs = buildRecommendations(busyWeek(), NOW);
    const rank = { high: 0, medium: 1, low: 2 } as const;

    for (let i = 1; i < recs.length; i++) {
      const prev = recs[i - 1];
      const cur = recs[i];
      expect(rank[prev.priority]).toBeLessThanOrEqual(rank[cur.priority]);
      if (prev.priority === cur.priority) {
        const a = prev.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
        const b = cur.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
        expect(a).toBeLessThanOrEqual(b);
      }
    }
  });
});

describe('cap', () => {
  it('trims a noisy week to the limit', () => {
    const upcoming = [
      atRiskItem({ id: 'p1' }),
      notPublishedItem({ id: 'q1', title: 'Tally A' }),
      notPublishedItem({ id: 'q2', title: 'Tally B' }),
      notPublishedItem({ id: 'q3', title: 'Tally C' }),
      notPublishedItem({ id: 'q4', title: 'Tally D' }),
    ];
    const attribution = attributed([
      driver('participation', -2),
      driver('powerDistribution', -1.5),
      driver('proposalDiversity', -1),
    ]);

    const recs = buildRecommendations({ upcoming, attribution, alerts: [alert()] }, NOW);
    expect(recs.length).toBe(RECOMMENDATION_LIMIT);
  });

  it('never drops a high-priority item to honour the cap', () => {
    // Eight live votes at risk — every one is a high, and every one survives.
    const upcoming = Array.from({ length: 8 }, (_, i) =>
      atRiskItem({ id: `p${i}`, title: `Proposal ${i}` }),
    );
    const attribution = attributed([
      driver('participation', -2),
      driver('powerDistribution', -1.5),
    ]);

    const recs = buildRecommendations({ upcoming, attribution, alerts: [alert()] }, NOW);
    const highs = recs.filter((r) => r.priority === 'high');

    expect(highs).toHaveLength(8);
    expect(recs.length).toBeGreaterThan(RECOMMENDATION_LIMIT);
    // The cap is fully consumed by highs, so nothing else gets in.
    expect(recs.filter((r) => r.priority !== 'high')).toHaveLength(0);
  });
});

// ===========================================================================
// The honest empty case
// ===========================================================================

describe('no_action_needed', () => {
  it('returns exactly one item for an entirely empty week', () => {
    const recs = buildRecommendations({}, NOW);

    expect(recs).toHaveLength(1);
    expect(recs[0].ruleId).toBe('no_action_needed');
    expect(recs[0].priority).toBe('low');
    expect(recs[0].deadline).toBeNull();
    expect(recs[0].evidence).toContain('week ending 2026-07-29');
  });

  it('states what was reviewed rather than claiming nothing happened', () => {
    const recs = buildRecommendations(
      {
        upcoming: [openItem(), openItem({ id: 'p2' })],
        whales: [whale({ decisiveness: NOT_DECISIVE })],
        alerts: [alert({ type: 'whale_vote' })],
        attribution: attributed([driver('participation', 1)]),
      },
      NOW,
    );

    expect(recs).toHaveLength(1);
    expect(recs[0].evidence).toContain('2 open votes');
    expect(recs[0].evidence).toContain('1 actionable alert,');
    expect(recs[0].evidence).toContain('1 whale vote');
    expect(recs[0].evidence).toContain('1 score driver');
  });

  it('is never emitted alongside a real recommendation', () => {
    expect(ruleIds(buildRecommendations(busyWeek(), NOW))).not.toContain('no_action_needed');
  });
});

// ===========================================================================
// Markdown
// ===========================================================================

describe('formatRecommendationsSection', () => {
  it('returns an empty string only for an empty array', () => {
    expect(formatRecommendationsSection([])).toBe('');
  });

  it('renders a real reassuring line for a quiet week', () => {
    const md = formatRecommendationsSection(buildRecommendations({}, NOW));

    expect(md).not.toBe('');
    expect(md.startsWith('\n\n## 🎯 Recommended actions')).toBe(true);
    expect(md).toContain('- ⚪ **No action required from this report');
    expect(md).toContain('`no_action_needed`');
    // No deadline line on an untimed item.
    expect(md).not.toContain('**By:**');
  });

  it('renders a busy week with priority markers, rule ids and deadlines', () => {
    const md = formatRecommendationsSection(buildRecommendations(busyWeek(), NOW));

    expect(md.startsWith('\n\n## 🎯 Recommended actions')).toBe(true);
    expect(md).toContain('🔴');
    expect(md).toContain('  - **Trigger:** `quorum_push` —');
    expect(md).toContain('  - **By:** 2026-08-01');
    // Style-matched to formatFallback: `- **bold**` bullets under a `## ` header.
    for (const line of md.split('\n')) {
      if (line.startsWith('- ')) expect(line).toMatch(/^- (🔴|🟠|⚪) \*\*.+\*\*$/);
    }
  });

  it('prints one Trigger line per recommendation', () => {
    const recs = buildRecommendations(busyWeek(), NOW);
    const md = formatRecommendationsSection(recs);
    expect(md.split('  - **Trigger:**').length - 1).toBe(recs.length);
  });
});
