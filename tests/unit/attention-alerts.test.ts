import { describe, it, expect } from 'vitest';
import {
  describeAlert,
  describeAlerts,
  formatAttentionAlertsSection,
  ATTENTION_ALERT_TYPES,
  ACTIONABLE_SEVERITIES,
  type AttentionAlertRow,
} from '@/server/services/org-report/attention-alerts';

/**
 * TODO-064. Everything here exercises the pure layer only — no DB, matching
 * the split in the module under test (fetchAttentionAlerts is the only
 * function that touches Drizzle).
 */

const CHOICES = ['For', 'Against', 'Abstain'];

function row(overrides: Partial<AttentionAlertRow> = {}): AttentionAlertRow {
  return {
    id: 'alert-1',
    type: 'whale_vote',
    severity: 'warning',
    title: '🐳 Whale vote on Uniswap: 23.4% VP',
    description: 'Address 0x1234…cdef cast 12.5M VP (23.4% of total) for "For" on "Raise treasury".',
    data: {},
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    proposalId: 'proposal-1',
    proposalTitle: 'Raise treasury allocation',
    proposalChoices: CHOICES,
    proposalState: 'active',
    proposalEndsAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('constants', () => {
  it('covers exactly the five alert types the detectors emit', () => {
    expect([...ATTENTION_ALERT_TYPES]).toEqual([
      'whale_vote',
      'last_minute_swing',
      'quorum_risk',
      'coordinated_voting',
      'score_drop',
    ]);
  });

  it('treats only critical and warning as actionable (info is excluded)', () => {
    expect([...ACTIONABLE_SEVERITIES]).toEqual(['critical', 'warning']);
    expect(ACTIONABLE_SEVERITIES).not.toContain('info');
  });
});

describe('describeAlert — whale_vote', () => {
  const whale = row({
    type: 'whale_vote',
    severity: 'critical',
    data: {
      voter: '0x1234567890abcdef1234567890abcdef12345678',
      vp: 12_500_000,
      vpPct: 23.4,
      choice: 1,
      choiceLabel: 'For',
      proposalTitle: 'Raise treasury allocation',
      proposalId: 'snapshot-external-id',
    },
  });

  it('carries the detector description through as whatHappened', () => {
    expect(describeAlert(whale).whatHappened).toContain('23.4% of total');
  });

  it('names the voter, their share of voting power, and their choice', () => {
    const p = describeAlert(whale).participants;
    expect(p).toContain('0x1234');
    expect(p).toContain('5678');
    expect(p).toContain('23.4% of voting power');
    expect(p).toContain('voted "For"');
  });

  it('explains concentration risk in whyItMatters', () => {
    const why = describeAlert(whale).whyItMatters;
    expect(why).toContain('single address');
    expect(why).toContain('before voting closes');
  });

  it('carries the proposal deadline and title', () => {
    const a = describeAlert(whale);
    expect(a.deadline?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(a.proposalTitle).toBe('Raise treasury allocation');
  });

  it('falls back to the 1-indexed choice column when choiceLabel is absent', () => {
    const a = describeAlert(
      row({
        type: 'whale_vote',
        data: { voter: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', vpPct: 11, choice: 2 },
      }),
    );
    expect(a.participants).toContain('voted "Against"');
  });
});

describe('describeAlert — last_minute_swing', () => {
  it('resolves the 0-indexed leaders against proposals.choices', () => {
    const a = describeAlert(
      row({
        id: 'alert-swing',
        type: 'last_minute_swing',
        severity: 'critical',
        title: '⚡ Vote swing detected on Raise treasury allocation',
        description: 'Result flipped from "For" to "Against" in the final hours.',
        data: { previousLeader: 0, currentLeader: 1, scores: [100, 140, 3] },
      }),
    );
    expect(a.participants).toBe('Leading choice flipped from "For" to "Against"');
    expect(a.whyItMatters).toContain('late in the voting window');
  });

  it('falls back to the raw index when the index is out of range', () => {
    const a = describeAlert(
      row({
        type: 'last_minute_swing',
        data: { previousLeader: 0, currentLeader: 7 },
      }),
    );
    expect(a.participants).toBe('Leading choice flipped from "For" to "choice #7"');
  });

  it('falls back to the raw index when proposal choices are unavailable', () => {
    const a = describeAlert(
      row({
        type: 'last_minute_swing',
        proposalChoices: null,
        data: { previousLeader: 2, currentLeader: 0 },
      }),
    );
    expect(a.participants).toBe('Leading choice flipped from "choice #2" to "choice #0"');
  });

  it('degrades cleanly when both leaders are missing', () => {
    const a = describeAlert(row({ type: 'last_minute_swing', data: {} }));
    expect(a.participants).toBe('Leading choices missing from the alert payload.');
  });
});

describe('describeAlert — quorum_risk', () => {
  it('states there are no individual participants rather than emitting nothing', () => {
    const a = describeAlert(
      row({
        type: 'quorum_risk',
        severity: 'warning',
        title: '⚠ Quorum risk: Raise treasury allocation',
        description: 'Proposal is at 42% of quorum with 20% of the voting window left.',
        data: { total: 42000, quorum: 100000, progress: 0.8 },
      }),
    );
    expect(a.participants).toContain('No individual voters');
    expect(a.participants).toContain('proposal-level signal');
    expect(a.whyItMatters).toContain('Below quorum the proposal fails');
    expect(a.deadline?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('describeAlert — coordinated_voting', () => {
  const voters = [
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2',
    '0xccccccccccccccccccccccccccccccccccccccc3',
  ];

  it('lists the address cluster and the shared choice', () => {
    const a = describeAlert(
      row({
        type: 'coordinated_voting',
        severity: 'warning',
        title: '🤝 Coordinated voting suspected on Uniswap',
        description: '3 addresses voted the same way with very similar voting power.',
        data: { voters, choice: 1 },
      }),
    );
    expect(a.participants).toContain('3 addresses:');
    expect(a.participants).toContain('0xaaaa');
    expect(a.participants).toContain('all voted "For"');
    expect(a.whyItMatters).toContain('Sybil cluster');
  });

  it('collapses long clusters to a "+N more" suffix', () => {
    const many = Array.from({ length: 9 }, (_, i) => `0x${String(i).repeat(40)}`);
    const a = describeAlert(row({ type: 'coordinated_voting', data: { voters: many, choice: 2 } }));
    expect(a.participants).toContain('9 addresses:');
    expect(a.participants).toContain('(+4 more)');
  });

  it('drops non-string members of the voters array', () => {
    const a = describeAlert(
      row({
        type: 'coordinated_voting',
        data: { voters: [voters[0], 42, null, voters[1], ''], choice: 1 },
      }),
    );
    expect(a.participants).toContain('2 addresses:');
  });
});

describe('describeAlert — score_drop', () => {
  const scoreDrop = row({
    id: 'alert-score',
    type: 'score_drop',
    severity: 'warning',
    title: '📉 Uniswap Democracy Score dropped 6.2 points',
    description: 'Score went from 74.0 to 67.8.',
    data: { prev: 74, current: 67.8, breakdown: { participation: 20, decentralization: 30 } },
    // score_drop is DAO-level: the detector always inserts a null proposalId.
    proposalId: null,
    proposalTitle: null,
    proposalChoices: null,
    proposalState: null,
    proposalEndsAt: null,
  });

  it('has no deadline and no proposal title', () => {
    const a = describeAlert(scoreDrop);
    expect(a.deadline).toBeNull();
    expect(a.proposalTitle).toBeNull();
  });

  it('states that the alert is DAO-level rather than per-voter', () => {
    const a = describeAlert(scoreDrop);
    expect(a.participants).toContain('No individual voters');
    expect(a.participants).toContain('DAO-level metric');
    expect(a.whyItMatters).toContain('Democracy Score fell');
  });

  it('ignores a stale joined proposal when proposalId is null', () => {
    const a = describeAlert({
      ...scoreDrop,
      proposalTitle: 'Should not leak',
      proposalEndsAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    expect(a.deadline).toBeNull();
    expect(a.proposalTitle).toBeNull();
  });
});

describe('describeAlert — malformed jsonb data', () => {
  it('never throws for any type when data is null', () => {
    for (const type of ATTENTION_ALERT_TYPES) {
      expect(() => describeAlert(row({ type, data: null }))).not.toThrow();
    }
  });

  it('never throws for any type when data is a scalar, array, or string', () => {
    for (const type of ATTENTION_ALERT_TYPES) {
      for (const data of [undefined, 42, 'oops', [], [1, 2, 3], true]) {
        expect(() => describeAlert(row({ type, data }))).not.toThrow();
      }
    }
  });

  it('still surfaces title, description and severity when data is unusable', () => {
    const a = describeAlert(row({ type: 'whale_vote', severity: 'critical', data: 'garbage' }));
    expect(a.title).toBe('🐳 Whale vote on Uniswap: 23.4% VP');
    expect(a.whatHappened).toContain('23.4% of total');
    expect(a.severity).toBe('critical');
    expect(a.whyItMatters).toContain('single address');
    expect(a.participants).toBe('Voter address missing from the alert payload.');
  });

  it('ignores wrong-typed values inside an otherwise valid payload', () => {
    const a = describeAlert(
      row({
        type: 'whale_vote',
        data: { voter: '0x1234567890abcdef1234567890abcdef12345678', vpPct: 'not-a-number', choice: {} },
      }),
    );
    expect(a.participants).toBe('0x1234…5678');
  });

  it('accepts numeric strings for vpPct (jsonb numerics can round-trip as text)', () => {
    const a = describeAlert(
      row({
        type: 'whale_vote',
        data: { voter: '0x1234567890abcdef1234567890abcdef12345678', vpPct: '23.4' },
      }),
    );
    expect(a.participants).toContain('23.4% of voting power');
  });

  it('rejects a non-integer choice index instead of misresolving it', () => {
    const a = describeAlert(row({ type: 'last_minute_swing', data: { previousLeader: 1.5, currentLeader: 2 } }));
    expect(a.participants).toBe('Leading choice flipped from "unknown" to "Abstain"');
  });

  it('falls back to the title when the description is empty', () => {
    const a = describeAlert(row({ description: '   ' }));
    expect(a.whatHappened).toBe('🐳 Whale vote on Uniswap: 23.4% VP');
  });

  it('handles an unknown alert type without throwing', () => {
    const a = describeAlert(row({ type: 'brand_new_detector', data: { anything: 1 } }));
    expect(a.whyItMatters).toContain('crossed the detector threshold');
    expect(a.participants).toContain('No participant detail available');
  });
});

describe('describeAlerts — ordering', () => {
  // Distinct proposals per row: whale alerts are thinned per proposal (see the
  // thinning describe below), so reusing one proposal here would drop rows and
  // stop this testing what it means to test — the ordering.
  it('puts critical before warning, then most recent first', () => {
    const ordered = describeAlerts([
      row({ id: 'w-old', severity: 'warning', proposalTitle: 'P1', createdAt: new Date('2026-07-18T00:00:00Z') }),
      row({ id: 'c-old', severity: 'critical', proposalTitle: 'P2', createdAt: new Date('2026-07-17T00:00:00Z') }),
      row({ id: 'w-new', severity: 'warning', proposalTitle: 'P3', createdAt: new Date('2026-07-21T00:00:00Z') }),
      row({ id: 'c-new', severity: 'critical', proposalTitle: 'P4', createdAt: new Date('2026-07-22T00:00:00Z') }),
    ]);
    expect(ordered.map((a) => a.id)).toEqual(['c-new', 'c-old', 'w-new', 'w-old']);
  });

  // Regression guard for a real defect found running the report against live
  // Aavegotchi data: twelve whale alerts on four clones of two proposals filled
  // the whole section with the same boilerplate and pushed out every other
  // alert type.
  it('keeps at most two whale alerts per proposal, but never thins other types', () => {
    const whales = describeAlerts([
      row({ id: 'w1', createdAt: new Date('2026-07-22T00:00:00Z') }),
      row({ id: 'w2', createdAt: new Date('2026-07-21T00:00:00Z') }),
      row({ id: 'w3', createdAt: new Date('2026-07-20T00:00:00Z') }),
      row({ id: 'w4', createdAt: new Date('2026-07-19T00:00:00Z') }),
    ]);
    expect(whales.map((a) => a.id)).toEqual(['w1', 'w2']);

    // Same proposal, different types — none of these are whale_vote, so all survive.
    const mixed = describeAlerts([
      row({ id: 'q', type: 'quorum_risk', data: { total: 1, quorum: 2, progress: 0.5 } }),
      row({ id: 's', type: 'last_minute_swing', data: { previousLeader: 0, currentLeader: 1 } }),
      row({ id: 'c', type: 'coordinated_voting', data: { voters: ['0xa'], choice: 1 } }),
    ]);
    expect(mixed).toHaveLength(3);
  });

  it('thins per proposal independently, not globally', () => {
    const out = describeAlerts([
      row({ id: 'a1', proposalTitle: 'A', createdAt: new Date('2026-07-22T00:00:00Z') }),
      row({ id: 'a2', proposalTitle: 'A', createdAt: new Date('2026-07-21T00:00:00Z') }),
      row({ id: 'a3', proposalTitle: 'A', createdAt: new Date('2026-07-20T00:00:00Z') }),
      row({ id: 'b1', proposalTitle: 'B', createdAt: new Date('2026-07-19T00:00:00Z') }),
      row({ id: 'b2', proposalTitle: 'B', createdAt: new Date('2026-07-18T00:00:00Z') }),
    ]);
    expect(out.map((a) => a.id)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('returns an empty array for no rows', () => {
    expect(describeAlerts([])).toEqual([]);
  });
});

describe('formatAttentionAlertsSection', () => {
  it('returns an empty string when there is nothing to report', () => {
    expect(formatAttentionAlertsSection([])).toBe('');
    expect(formatAttentionAlertsSection(describeAlerts([]))).toBe('');
  });

  it('renders a section heading and one block per alert', () => {
    const md = formatAttentionAlertsSection(
      describeAlerts([
        row({
          id: 'a',
          type: 'whale_vote',
          severity: 'critical',
          data: { voter: '0x1234567890abcdef1234567890abcdef12345678', vpPct: 23.4, choiceLabel: 'For' },
        }),
        row({
          id: 'b',
          type: 'quorum_risk',
          severity: 'warning',
          title: '⚠ Quorum risk: Raise treasury allocation',
          description: 'Proposal is at 42% of quorum.',
          data: { total: 42000, quorum: 100000, progress: 0.8 },
        }),
      ]),
    );

    expect(md.startsWith('\n\n## 🚨 Alerts requiring attention\n')).toBe(true);
    expect(md).toContain('- 🔴 **🐳 Whale vote on Uniswap: 23.4% VP** — _Raise treasury allocation_');
    expect(md).toContain('- 🟠 **⚠ Quorum risk: Raise treasury allocation**');
    expect(md).toContain('  - **What happened:**');
    expect(md).toContain('  - **Why it matters:**');
    expect(md).toContain('  - **Who:**');
    expect(md).toContain('  - **Deadline:** 2026-08-01');
  });

  it('omits the deadline line entirely for DAO-level alerts', () => {
    const md = formatAttentionAlertsSection(
      describeAlerts([
        row({
          type: 'score_drop',
          title: '📉 Uniswap Democracy Score dropped 6.2 points',
          description: 'Score went from 74.0 to 67.8.',
          data: { prev: 74, current: 67.8 },
          proposalId: null,
          proposalTitle: null,
          proposalChoices: null,
          proposalState: null,
          proposalEndsAt: null,
        }),
      ]),
    );
    expect(md).not.toContain('**Deadline:**');
    expect(md).toContain('- 🟠 **📉 Uniswap Democracy Score dropped 6.2 points**');
    expect(md).not.toContain('— _');
  });

  it('does not repeat the proposal title when the alert title already contains it', () => {
    const md = formatAttentionAlertsSection(
      describeAlerts([
        row({
          type: 'last_minute_swing',
          severity: 'critical',
          title: '⚡ Vote swing detected on Raise treasury allocation',
          data: { previousLeader: 0, currentLeader: 1 },
        }),
      ]),
    );
    expect(md).toContain('- 🔴 **⚡ Vote swing detected on Raise treasury allocation**\n');
    expect(md).not.toContain('— _Raise treasury allocation_');
  });

  it('uses a neutral marker for an unrecognised severity', () => {
    const md = formatAttentionAlertsSection(describeAlerts([row({ severity: 'unknown' })]));
    expect(md).toContain('- ⚪ **');
  });

  it('renders all five alert types in one section without throwing', () => {
    const md = formatAttentionAlertsSection(
      describeAlerts(ATTENTION_ALERT_TYPES.map((type, i) => row({ id: type, type, data: null, createdAt: new Date(2026, 6, 20 - i) }))),
    );
    expect(md.match(/ {2}- \*\*Why it matters:\*\*/g)).toHaveLength(5);
  });
});
