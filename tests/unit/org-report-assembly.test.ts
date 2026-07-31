import { describe, it, expect } from 'vitest';
import {
  composeOrgReportBody,
  formatConciergeNotesSection,
  formatMethodologyFooter,
  orgReportTitle,
  type OrgReportSectionData,
} from '@/server/services/org-report';
import { startOfIsoWeekUtc } from '@/server/services/org-report/week';
import {
  buildExecutiveSummary,
  renderDeterministicSummary,
} from '@/server/services/org-report/executive-summary';
import { buildRecommendations } from '@/server/services/org-report/recommendations';
import type { AttentionAlert } from '@/server/services/org-report/attention-alerts';
import type { ScoreAttribution } from '@/server/services/org-report/score-attribution';
import type { UpcomingProposalItem } from '@/server/services/org-report/upcoming-quorum';
import type { WhaleContextItem } from '@/server/services/org-report/whale-context';
import type { ResolvedOrgNote } from '@/server/api/org-notes';

const WEEK_OF = new Date('2026-07-06T00:00:00Z');
const DEADLINE = new Date('2026-07-09T00:00:00Z');

// ---------------------------------------------------------------------------
// Fixtures — a realistic busy week and a genuinely empty one
// ---------------------------------------------------------------------------

const BUSY_ALERTS: AttentionAlert[] = [
  {
    id: 'alert-whale',
    type: 'whale_vote',
    severity: 'critical',
    title: '🐳 Whale vote on Fee switch activation',
    whatHappened: 'A single address cast 21.4% of the voting power on this proposal.',
    whyItMatters:
      'A single address holding this share of voting power can carry or sink the proposal on its own.',
    participants: '0x1234…cdef — 21.4% of voting power — voted "For"',
    deadline: DEADLINE,
    deadlinePassed: false,
    proposalTitle: 'Fee switch activation',
    createdAt: new Date('2026-07-04T10:00:00Z'),
    voter: '0x123400000000000000000000000000000000cdef',
    normalizedTitle: 'Fee switch activation',
    choiceKey: '1',
    collapsedCount: 0,
  },
  {
    id: 'alert-swing',
    type: 'last_minute_swing',
    severity: 'warning',
    title: '⚡ Vote swing detected on Grants round 12',
    whatHappened: 'The leading choice changed in the final 10% of the voting window.',
    whyItMatters: 'Late flips produce outcomes the community did not have time to respond to.',
    participants: 'Leading choice flipped from "Against" to "For"',
    deadline: new Date('2026-07-05T00:00:00Z'),
    deadlinePassed: false,
    proposalTitle: 'Grants round 12',
    voter: null,
    normalizedTitle: 'Grants round 12',
    choiceKey: '1',
    collapsedCount: 0,
    createdAt: new Date('2026-07-05T09:00:00Z'),
  },
];

const BUSY_WHALES: WhaleContextItem[] = [
  {
    alertId: 'alert-whale',
    createdAt: new Date('2026-07-04T10:00:00Z'),
    voter: '0x1234567890abcdef1234567890abcdef12345678',
    vp: 940,
    vpPctAtAlert: 21.4,
    vpPctOfScores: 21.4,
    choiceLabel: 'For',
    proposalTitle: 'Fee switch activation',
    proposalId: 'prop-1',
    proposalState: 'active',
    votingType: 'single-choice',
    choices: ['For', 'Against'],
    delegate: {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      displayName: 'blockchainer.eth',
      isPubliclyIdentified: true,
      karmaScore: 88.5,
      karmaRank: 7,
      karmaUrl: null,
      participationRate: 0.92,
      totalVotesCast: 214,
      totalDaosActive: 6,
      daoVotingPower: 940,
    },
    decisiveness: {
      status: 'decisive',
      leaderIndex: 0,
      counterfactualLeaderIndex: 1,
      choiceIndex: 0,
      runnerUpIndex: 1,
      marginPct: 8.2,
      vpPct: 21.4,
      vp: 940,
    },
  },
];

const BUSY_UPCOMING: UpcomingProposalItem[] = [
  {
    phase: 'open',
    id: 'prop-1',
    title: 'Fee switch activation',
    source: 'snapshot',
    endTimestamp: DEADLINE,
    votesCount: 148,
    quorum: { status: 'at_risk', pct: 62, scoresTotal: 620, quorum: 999, windowElapsed: 0.88 },
    standing: {
      leadingChoice: 'For',
      leadingScore: 400,
      leadingSharePct: 64.5,
      runnerUpChoice: 'Against',
      runnerUpScore: 220,
      marginPct: 29,
    },
    timeLeft: '3d left',
  },
  {
    phase: 'not_yet_open',
    id: 'prop-2',
    title: 'Treasury diversification',
    source: 'tally',
    startTimestamp: new Date('2026-07-10T00:00:00Z'),
    endTimestamp: new Date('2026-07-17T00:00:00Z'),
    opensIn: 'opens in 4d',
  },
];

const BUSY_ATTRIBUTION: ScoreAttribution = {
  status: 'attributed',
  period: {
    currentComputedAt: WEEK_OF,
    baselineComputedAt: new Date('2026-06-29T00:00:00Z'),
    ageDays: 7,
    coversFullWeek: true,
  },
  previousScore: 71,
  currentScore: 64,
  scoreDelta: -7,
  attributedDelta: -7,
  residual: 0,
  drivers: [
    {
      metric: 'participation',
      label: 'Voter participation',
      hint: 'A proxy for turnout, measured against recorded voters rather than all token holders.',
      previous: 62,
      current: 42,
      delta: -20,
      contribution: -5,
    },
    {
      metric: 'manipulationResistance',
      label: 'Manipulation resistance',
      hint: 'Falls when proposals are decided by one large holder or flip near the deadline.',
      previous: 80,
      current: 70,
      delta: -10,
      contribution: -2,
    },
  ],
};

const BUSY_NOTES: ResolvedOrgNote[] = [
  {
    id: 'note-1',
    subjectType: 'proposal',
    subjectId: 'prop-1',
    note: 'Client asked us to watch this one — treasury team is drafting a counter-proposal.',
    createdAt: new Date('2026-07-03T00:00:00Z'),
    authorName: 'Dana Okafor',
    authorEmail: 'dana@example.com',
    subjectLabel: 'Fee switch activation',
  },
];

function busyData(): OrgReportSectionData {
  const recommendations = buildRecommendations(
    {
      upcoming: BUSY_UPCOMING,
      whales: BUSY_WHALES,
      alerts: BUSY_ALERTS,
      attribution: BUSY_ATTRIBUTION,
    },
    WEEK_OF,
  );
  const summary = buildExecutiveSummary({
    organizationName: 'Acme Governance',
    daoName: 'Uniswap',
    weekStart: WEEK_OF,
    upcoming: BUSY_UPCOMING,
    whales: BUSY_WHALES,
    alerts: BUSY_ALERTS,
    attribution: BUSY_ATTRIBUTION,
    recommendations,
  });

  return {
    organizationDisplayName: 'Acme Governance',
    daoName: 'Uniswap',
    identities: new Map(),
    weekOf: WEEK_OF,
    weekStart: WEEK_OF,
    summary,
    summaryProse: renderDeterministicSummary(summary),
    recommendations,
    alerts: BUSY_ALERTS,
    upcoming: BUSY_UPCOMING,
    staleActiveCount: 1,
    whales: BUSY_WHALES,
    attribution: BUSY_ATTRIBUTION,
    notes: BUSY_NOTES,
    unresolvedNotesCount: 1,
  };
}

function emptyData(): OrgReportSectionData {
  const recommendations = buildRecommendations({}, WEEK_OF);
  const summary = buildExecutiveSummary({
    organizationName: 'Acme Governance',
    daoName: 'Uniswap',
    weekStart: WEEK_OF,
    recommendations,
  });
  return {
    organizationDisplayName: 'Acme Governance',
    daoName: 'Uniswap',
    identities: new Map(),
    weekOf: WEEK_OF,
    weekStart: WEEK_OF,
    summary,
    summaryProse: renderDeterministicSummary(summary),
    recommendations,
    alerts: [],
    upcoming: [],
    staleActiveCount: 0,
    whales: [],
    // The DAO has never been scored: the section formatter returns '' for this.
    attribution: { status: 'unavailable', reason: 'no_current_snapshot' },
    notes: [],
    unresolvedNotesCount: 0,
  };
}

// ---------------------------------------------------------------------------

describe('orgReportTitle', () => {
  it('names the customer and the DAO — not "DAO Sentinel Weekly", the free digest title', () => {
    const title = orgReportTitle('Acme Governance', 'Uniswap', WEEK_OF);
    expect(title).toBe('Acme Governance — Uniswap governance report — week of 2026-07-06');
    expect(title).not.toContain('DAO Sentinel Weekly');
  });

  /**
   * TODO-082. A report first opened mid-week used to title itself with the
   * generation date while its stored `week_start`, its PDF subtitle, its
   * filename and its archive row all carried the Monday — one document
   * claiming two different weeks.
   */
  it('labels the body by the ISO week, not by the day it was generated', () => {
    const generatedOnFriday = new Date('2026-07-10T14:32:00Z');
    const weekStart = startOfIsoWeekUtc(generatedOnFriday);
    expect(weekStart.toISOString().slice(0, 10)).toBe('2026-07-06');

    const summary = buildExecutiveSummary({
      organizationName: 'Acme Governance',
      daoName: 'Uniswap',
      weekStart,
    });

    const body = composeOrgReportBody({
      ...busyData(),
      weekOf: generatedOnFriday,
      weekStart,
      summary,
      summaryProse: renderDeterministicSummary(summary),
    });

    expect(body).toContain('week of 2026-07-06');
    expect(body).not.toContain('2026-07-10');
  });
});

describe('composeOrgReportBody — a busy week', () => {
  const body = composeOrgReportBody(busyData());

  it('opens with the report title exactly once', () => {
    const title = orgReportTitle('Acme Governance', 'Uniswap', WEEK_OF);
    expect(body.startsWith(`# ${title}`)).toBe(true);
    expect(body.split(title)).toHaveLength(2); // one occurrence
    // Exactly one h1 in the whole document.
    expect(body.split('\n').filter((l) => l.startsWith('# '))).toHaveLength(1);
  });

  it('answers "what do I do" before "what happened"', () => {
    const order = [
      '## 🧭 Executive summary',
      '## 🎯 Recommended actions',
      '## 🚨 Alerts requiring attention',
      '## 🗳️ Open votes — quorum & standing',
      '## 🐳 Whale & delegate context',
      '## 🔍 What moved the Democracy Score',
      '## 🗒️ Concierge notes',
      '## 📐 Methodology & definitions',
    ];
    const positions = order.map((h) => body.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('carries the risk level and its drivers up top', () => {
    expect(body).toContain('Governance risk: HIGH');
    // Internal codes are not printed any more (TODO-080); the driver reads as
    // its level plus the specific fact that fired it.
    expect(body).not.toContain('`decisive_whale_open_vote`');
    expect(body).toContain('**High** —');
    // The score driver reads as its level plus the actual move (TODO-080).
    expect(body).not.toContain('`severe_score_drop`');
    expect(body).toContain('severe-drop threshold');
  });

  it('keeps the evidence sections intact', () => {
    expect(body).toContain('blockchainer.eth');
    expect(body).toContain('⚠️ **Decisive**');
    expect(body).toContain('quorum at risk');
    expect(body).toContain('Voter participation');
    expect(body).toContain('Client asked us to watch this one');
    // The stale-active-proposal note from upcoming-quorum survives composition.
    expect(body).toContain('awaiting the next sync');
    // ...as does the unresolved-notes notice from org-notes.
    expect(body).toContain('could not be matched to Uniswap');
  });

  it('stays inside a readable length budget', () => {
    const words = body.split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(1500);
  });

  it('never opens or closes with stray blank lines', () => {
    expect(body).toBe(body.trimStart());
    expect(body.startsWith('#')).toBe(true);
  });
});

describe('composeOrgReportBody — an empty week', () => {
  const body = composeOrgReportBody(emptyData());

  it('is still a valid, honest document rather than a skeleton of headings', () => {
    expect(body).toContain('## 🧭 Executive summary');
    expect(body).toContain('Governance risk: LOW');
    expect(body).toContain('No risk condition fired');
    expect(body).toContain('## 🎯 Recommended actions');
    // The reassuring line itself, not the rule id behind it (TODO-080).
    expect(body).toContain('No action required from this report');
    expect(body).toContain('## 📐 Methodology & definitions');
  });

  it('omits every section that has nothing to say instead of printing an empty heading', () => {
    expect(body).not.toContain('## 🚨 Alerts requiring attention');
    expect(body).not.toContain('## 🗳️ Open votes');
    expect(body).not.toContain('## 🐳 Whale & delegate context');
    expect(body).not.toContain('## 🔍 What moved the Democracy Score');
    expect(body).not.toContain('## 🗒️ Concierge notes');
  });

  it('says what was reviewed, so "nothing happened" is a result and not a failure', () => {
    expect(body).toContain('Reviewed 0 open votes');
    expect(body).toContain('week of 2026-07-06');
  });
});

describe('composeOrgReportBody — title duplication', () => {
  it('omits the title line entirely when the surface renders its own header', () => {
    const data = busyData();
    const withTitle = composeOrgReportBody(data, { includeTitle: true });
    const withoutTitle = composeOrgReportBody(data, { includeTitle: false });
    const title = orgReportTitle('Acme Governance', 'Uniswap', WEEK_OF);

    expect(withTitle).toContain(`# ${title}`);
    expect(withoutTitle).not.toContain(title);
    expect(withoutTitle.split('\n').filter((l) => l.startsWith('# '))).toHaveLength(0);
    // The at-a-glance table now leads the document (TODO-076).
    expect(withoutTitle.startsWith('## ⚡ At a glance')).toBe(true);
  });

  it('never repeats "governance report — week of" anywhere in the body', () => {
    for (const body of [
      composeOrgReportBody(busyData()),
      composeOrgReportBody(busyData(), { includeTitle: false }),
      composeOrgReportBody(emptyData()),
    ]) {
      expect(body.split('governance report — week of').length - 1).toBeLessThanOrEqual(1);
    }
  });
});

describe('formatConciergeNotesSection', () => {
  it('renders nothing when there is nothing to say', () => {
    expect(formatConciergeNotesSection([], null)).toBe('');
  });

  it('renders one bullet per note with its subject, author and date', () => {
    const md = formatConciergeNotesSection(BUSY_NOTES, null);
    expect(md.startsWith('\n\n## 🗒️ Concierge notes')).toBe(true);
    expect(md).toContain('- **[proposal]** Fee switch activation —');
    expect(md).toContain('_(Dana Okafor, 2026-07-03)_');
  });

  it('falls back to the author email when no name is recorded', () => {
    const md = formatConciergeNotesSection([{ ...BUSY_NOTES[0], authorName: null }], null);
    expect(md).toContain('_(dana@example.com, 2026-07-03)_');
  });

  it('still renders when every note was excluded, so the count is never silently lost', () => {
    const md = formatConciergeNotesSection([], '2 concierge notes could not be matched to Uniswap.');
    expect(md).toContain('## 🗒️ Concierge notes');
    expect(md).toContain('could not be matched to Uniswap');
  });

  it('caps the list and says how many were held back', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...BUSY_NOTES[0], id: `n-${i}` }));
    const md = formatConciergeNotesSection(many, null, 3);
    expect(md.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(3);
    expect(md).toContain('2 older notes not shown');
  });
});

describe('formatMethodologyFooter', () => {
  const md = formatMethodologyFooter();

  it('states the quorum flag threshold AND the window rule', () => {
    expect(md).toContain('under 80% of the required quorum');
    expect(md).toContain('under 25% of the voting window remaining');
  });

  it('states the score-attribution formula and its reconciliation tolerance', () => {
    expect(md).toContain('(metric now − metric at the baseline snapshot) × that metric');
    expect(md).toContain('±0.1 rounding residual');
  });

  it('defines "decisive" as a counterfactual recompute, not a margin comparison', () => {
    expect(md).toContain('counterfactual recompute, not a margin comparison');
    expect(md).toContain("subtracted from the choice they backed");
  });

  it('says explicitly that nothing in the report is a prediction', () => {
    expect(md).toContain('Nothing in this report is a prediction');
    expect(md).toContain('no forecast of any kind');
  });

  it('separates itself from the report body with a thematic break', () => {
    expect(md.startsWith('\n\n---\n\n## 📐 Methodology & definitions')).toBe(true);
  });
});
