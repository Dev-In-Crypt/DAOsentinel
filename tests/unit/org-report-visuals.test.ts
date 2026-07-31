import { describe, expect, it } from 'vitest';
import {
  buildAttributionBars,
  buildOrgReportVisuals,
  buildQuorumMeters,
} from '@/server/services/org-report/visuals';
import type { ScoreAttribution } from '@/server/services/org-report/score-attribution';
import type { UpcomingProposalItem } from '@/server/services/org-report/upcoming-quorum';

/**
 * The charts must never say something the prose of the same report would not.
 * Both builders therefore mirror a filter that already exists in the markdown
 * formatters: `not_published` quorum has no denominator to draw (see
 * `formatQuorumLine`), and a zero-contribution metric is already excluded from
 * the attribution bullets (`movers` in `formatScoreAttributionSection`).
 */

const OPEN_AT_RISK: UpcomingProposalItem = {
  phase: 'open',
  id: 'prop-1',
  title: 'Fee switch activation',
  source: 'snapshot',
  endTimestamp: new Date('2026-07-09T00:00:00Z'),
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
};

const OPEN_NOT_PUBLISHED: UpcomingProposalItem = {
  phase: 'open',
  id: 'prop-2',
  title: 'Governor param tweak',
  source: 'tally',
  endTimestamp: new Date('2026-07-09T00:00:00Z'),
  votesCount: 10,
  quorum: { status: 'not_published', reason: 'quorum not published by this source' },
  standing: null,
  timeLeft: '1d left',
};

const NOT_YET_OPEN: UpcomingProposalItem = {
  phase: 'not_yet_open',
  id: 'prop-3',
  title: 'Treasury diversification',
  source: 'tally',
  startTimestamp: new Date('2026-07-10T00:00:00Z'),
  endTimestamp: new Date('2026-07-17T00:00:00Z'),
  opensIn: 'opens in 4d',
};

describe('buildQuorumMeters', () => {
  it('includes only open proposals with a published quorum figure', () => {
    const meters = buildQuorumMeters([OPEN_AT_RISK, OPEN_NOT_PUBLISHED, NOT_YET_OPEN]);
    expect(meters).toEqual([{ label: 'Fee switch activation', pct: 62, status: 'at_risk' }]);
  });

  it('returns [] when nothing qualifies', () => {
    expect(buildQuorumMeters([OPEN_NOT_PUBLISHED, NOT_YET_OPEN])).toEqual([]);
  });

  it('carries a pct over 100 unclamped (quorum already exceeded)', () => {
    const met: UpcomingProposalItem = {
      ...OPEN_AT_RISK,
      quorum: { status: 'met', pct: 142, scoresTotal: 1420, quorum: 1000, windowElapsed: 0.5 },
    };
    expect(buildQuorumMeters([met])).toEqual([
      { label: 'Fee switch activation', pct: 142, status: 'met' },
    ]);
  });
});

const ATTRIBUTED: ScoreAttribution = {
  status: 'attributed',
  period: {
    currentComputedAt: new Date('2026-07-06T00:00:00Z'),
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
      hint: '',
      previous: 62,
      current: 42,
      delta: -20,
      contribution: -5,
    },
    {
      metric: 'proposalDiversity',
      label: 'Proposal diversity',
      hint: '',
      previous: 50,
      current: 50,
      delta: 0,
      contribution: 0,
    },
    {
      metric: 'manipulationResistance',
      label: 'Manipulation resistance',
      hint: '',
      previous: 80,
      current: 70,
      delta: -10,
      contribution: -2,
    },
  ],
};

describe('buildAttributionBars', () => {
  it('drops zero-contribution drivers, keeps the rest in their given order', () => {
    expect(buildAttributionBars(ATTRIBUTED)).toEqual([
      { label: 'Voter participation', contribution: -5 },
      { label: 'Manipulation resistance', contribution: -2 },
    ]);
  });

  it('returns [] for every unavailable reason', () => {
    expect(buildAttributionBars({ status: 'unavailable', reason: 'first_period' })).toEqual([]);
    expect(buildAttributionBars({ status: 'unavailable', reason: 'no_current_snapshot' })).toEqual(
      [],
    );
  });
});

describe('buildOrgReportVisuals', () => {
  it('composes both builders into one object', () => {
    const visuals = buildOrgReportVisuals([OPEN_AT_RISK], ATTRIBUTED);
    expect(visuals.quorumMeters).toHaveLength(1);
    expect(visuals.attributionBars).toHaveLength(2);
  });

  it('returns empty arrays, not undefined, for a quiet week', () => {
    const visuals = buildOrgReportVisuals([], { status: 'unavailable', reason: 'first_period' });
    expect(visuals).toEqual({ quorumMeters: [], attributionBars: [] });
  });
});
