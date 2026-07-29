import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildExecutiveSummary,
  buildKeyEvents,
  buildRiskDrivers,
  formatExecutiveSummarySection,
  proseIsSafe,
  renderDeterministicSummary,
  riskLevelFromDrivers,
  summaryFacts,
  writeExecutiveSummaryProse,
  KEY_EVENT_LIMIT,
  MATERIAL_SCORE_DROP,
  MAX_PROSE_CHARS,
  MIN_PROSE_CHARS,
  SEVERE_SCORE_DROP,
  type ExecutiveSummaryInput,
} from '@/server/services/org-report/executive-summary';
import type { AttentionAlert } from '@/server/services/org-report/attention-alerts';
import type { ScoreAttribution } from '@/server/services/org-report/score-attribution';
import type { UpcomingProposalItem } from '@/server/services/org-report/upcoming-quorum';
import type { WhaleContextItem } from '@/server/services/org-report/whale-context';

// The single AI call in the module. Mocked so the fallback-first contract can
// be exercised for every shape `chat()` can actually return — including
// `{ text: '' }`, which is a SUCCESSFUL but empty completion and the reason the
// truthiness check is `r?.text` rather than `!r`.
const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('@/server/ai/openrouter', () => ({ chat: chatMock }));

const WEEK_OF = new Date('2026-07-06T00:00:00Z');
const DEADLINE = new Date('2026-07-09T00:00:00Z');

function baseInput(over: Partial<ExecutiveSummaryInput> = {}): ExecutiveSummaryInput {
  return { organizationName: 'Acme Governance', daoName: 'Uniswap', weekOf: WEEK_OF, ...over };
}

function alert(over: Partial<AttentionAlert> = {}): AttentionAlert {
  return {
    id: 'alert-1',
    type: 'whale_vote',
    severity: 'warning',
    title: 'Whale vote detected',
    whatHappened: 'A single address cast a large share of voting power.',
    whyItMatters: 'One counterparty can carry the vote.',
    participants: '0x1234…cdef — voted "For"',
    deadline: null,
    proposalTitle: null,
    createdAt: WEEK_OF,
    ...over,
  };
}

function whale(over: Partial<WhaleContextItem> = {}): WhaleContextItem {
  return {
    alertId: 'alert-1',
    createdAt: WEEK_OF,
    voter: '0x1234567890abcdef1234567890abcdef12345678',
    vp: 900,
    vpPctAtAlert: 12.5,
    vpPctOfScores: 12.5,
    choiceLabel: 'For',
    proposalTitle: 'Fee switch activation',
    proposalId: 'prop-1',
    proposalState: 'active',
    votingType: 'single-choice',
    choices: ['For', 'Against'],
    delegate: null,
    decisiveness: {
      status: 'decisive',
      leaderIndex: 0,
      counterfactualLeaderIndex: 1,
      choiceIndex: 0,
      runnerUpIndex: 1,
      marginPct: 4,
      vpPct: 12.5,
      vp: 900,
    },
    ...over,
  };
}

function openVote(over: Partial<Extract<UpcomingProposalItem, { phase: 'open' }>> = {}) {
  return {
    phase: 'open' as const,
    id: 'prop-1',
    title: 'Fee switch activation',
    source: 'snapshot',
    endTimestamp: DEADLINE,
    votesCount: 42,
    quorum: {
      status: 'at_risk' as const,
      pct: 62,
      scoresTotal: 620,
      quorum: 999,
      windowElapsed: 0.9,
    },
    standing: null,
    timeLeft: '3d left',
    ...over,
  };
}

function attributed(scoreDelta: number): ScoreAttribution {
  return {
    status: 'attributed',
    period: {
      currentComputedAt: WEEK_OF,
      baselineComputedAt: new Date('2026-06-29T00:00:00Z'),
      ageDays: 7,
      coversFullWeek: true,
    },
    previousScore: 71,
    currentScore: 71 + scoreDelta,
    scoreDelta,
    attributedDelta: scoreDelta,
    residual: 0,
    drivers: [
      {
        metric: 'participation',
        label: 'Voter participation',
        hint: 'Share of eligible voters who voted.',
        previous: 60,
        current: 60 + scoreDelta * 4,
        delta: scoreDelta * 4,
        contribution: scoreDelta,
      },
    ],
  };
}

// ===========================================================================
// The risk ladder — one test per branch, each in isolation
// ===========================================================================

describe('risk ladder — high', () => {
  it('fires on a decisive whale on a still-open proposal', () => {
    const s = buildExecutiveSummary(baseInput({ whales: [whale({ proposalState: 'active' })] }));
    expect(s.riskLevel).toBe('high');
    expect(s.drivers.map((d) => d.code)).toContain('decisive_whale_open_vote');
  });

  it('does NOT fire on a decisive whale whose proposal already closed', () => {
    const s = buildExecutiveSummary(baseInput({ whales: [whale({ proposalState: 'closed' })] }));
    expect(s.riskLevel).toBe('low');
  });

  it('fires on any last_minute_swing alert, regardless of severity', () => {
    const s = buildExecutiveSummary(
      baseInput({ alerts: [alert({ type: 'last_minute_swing', severity: 'warning' })] }),
    );
    expect(s.riskLevel).toBe('high');
    expect(s.drivers.map((d) => d.code)).toContain('last_minute_swing');
  });

  it('fires on two or more open votes at quorum_at_risk', () => {
    const s = buildExecutiveSummary(
      baseInput({
        upcoming: [openVote(), openVote({ id: 'prop-2', title: 'Treasury diversification' })],
      }),
    );
    expect(s.riskLevel).toBe('high');
    expect(s.drivers.map((d) => d.code)).toContain('multiple_quorum_at_risk');
    // ...and the single-vote driver must NOT also fire: they are exclusive.
    expect(s.drivers.map((d) => d.code)).not.toContain('quorum_at_risk');
  });

  it('counts at-risk votes per distinct proposal, so one duplicated row is not a pattern', () => {
    const s = buildExecutiveSummary(baseInput({ upcoming: [openVote(), openVote()] }));
    expect(s.riskLevel).toBe('elevated');
    expect(s.drivers.map((d) => d.code)).toEqual(['quorum_at_risk']);
  });

  it(`fires on a score delta at or past ${SEVERE_SCORE_DROP}`, () => {
    expect(buildExecutiveSummary(baseInput({ attribution: attributed(-5) })).riskLevel).toBe('high');
    expect(buildExecutiveSummary(baseInput({ attribution: attributed(-7) })).riskLevel).toBe('high');
  });
});

describe('risk ladder — elevated', () => {
  it('fires on a critical alert', () => {
    const s = buildExecutiveSummary(
      baseInput({ alerts: [alert({ severity: 'critical', type: 'whale_vote' })] }),
    );
    expect(s.riskLevel).toBe('elevated');
    expect(s.drivers.map((d) => d.code)).toContain('critical_alert');
  });

  it('fires on exactly one open vote at quorum_at_risk', () => {
    const s = buildExecutiveSummary(baseInput({ upcoming: [openVote()] }));
    expect(s.riskLevel).toBe('elevated');
    expect(s.drivers.map((d) => d.code)).toContain('quorum_at_risk');
  });

  it('fires on a coordinated_voting alert', () => {
    const s = buildExecutiveSummary(
      baseInput({ alerts: [alert({ type: 'coordinated_voting', severity: 'warning' })] }),
    );
    expect(s.riskLevel).toBe('elevated');
    expect(s.drivers.map((d) => d.code)).toContain('coordinated_voting');
  });

  it(`fires on a score delta at or past ${MATERIAL_SCORE_DROP} but above ${SEVERE_SCORE_DROP}`, () => {
    const s = buildExecutiveSummary(baseInput({ attribution: attributed(-2) }));
    expect(s.riskLevel).toBe('elevated');
    expect(s.drivers.map((d) => d.code)).toEqual(['material_score_drop']);
  });

  it('emits only the severe score driver on a big drop, never both score drivers', () => {
    const codes = buildExecutiveSummary(baseInput({ attribution: attributed(-9) })).drivers.map(
      (d) => d.code,
    );
    expect(codes).toEqual(['severe_score_drop']);
  });
});

describe('risk ladder — low', () => {
  it('is low for an empty week', () => {
    const s = buildExecutiveSummary(baseInput());
    expect(s.riskLevel).toBe('low');
    expect(s.drivers).toEqual([]);
  });

  it('is low for a busy but healthy week (open votes on track, non-decisive whale, score up)', () => {
    const s = buildExecutiveSummary(
      baseInput({
        upcoming: [
          openVote({
            quorum: { status: 'met', pct: 140, scoresTotal: 1400, quorum: 999, windowElapsed: 0.5 },
          }),
        ],
        whales: [
          whale({
            decisiveness: {
              status: 'not_decisive',
              leaderIndex: 0,
              counterfactualLeaderIndex: 0,
              choiceIndex: 0,
              runnerUpIndex: 1,
              marginPct: 30,
              vpPct: 12.5,
              vp: 900,
            },
          }),
        ],
        attribution: attributed(3),
      }),
    );
    expect(s.riskLevel).toBe('low');
    expect(s.drivers).toEqual([]);
  });

  it('never returns a non-low level without at least one driver', () => {
    const inputs: ExecutiveSummaryInput[] = [
      baseInput({ whales: [whale()] }),
      baseInput({ alerts: [alert({ type: 'last_minute_swing' })] }),
      baseInput({ upcoming: [openVote()] }),
      baseInput({ attribution: attributed(-6) }),
      baseInput({ alerts: [alert({ severity: 'critical' })] }),
    ];
    for (const input of inputs) {
      const s = buildExecutiveSummary(input);
      expect(s.riskLevel).not.toBe('low');
      expect(s.drivers.length).toBeGreaterThan(0);
      // Every driver names the fact that fired it.
      for (const d of s.drivers) expect(d.detail.trim()).not.toBe('');
    }
  });

  it('riskLevelFromDrivers takes the highest level present', () => {
    expect(riskLevelFromDrivers([])).toBe('low');
    expect(
      riskLevelFromDrivers([{ code: 'critical_alert', level: 'elevated', detail: 'x' }]),
    ).toBe('elevated');
    expect(
      riskLevelFromDrivers([
        { code: 'critical_alert', level: 'elevated', detail: 'x' },
        { code: 'last_minute_swing', level: 'high', detail: 'y' },
      ]),
    ).toBe('high');
  });

  it('drivers carry the actual numbers, not just a label', () => {
    const drivers = buildRiskDrivers(baseInput({ upcoming: [openVote()] }));
    expect(drivers[0].detail).toContain('Fee switch activation');
    expect(drivers[0].detail).toContain('62%');
    expect(drivers[0].detail).toContain('3d left');
  });
});

// ===========================================================================
// Key events
// ===========================================================================

describe('key events', () => {
  it('emits what exists without padding when fewer than three things happened', () => {
    const events = buildKeyEvents(baseInput({ alerts: [alert({ severity: 'critical' })] }));
    expect(events).toHaveLength(1);
  });

  it('emits nothing at all for an empty week', () => {
    expect(buildKeyEvents(baseInput())).toEqual([]);
  });

  it(`caps at ${KEY_EVENT_LIMIT}`, () => {
    const events = buildKeyEvents(
      baseInput({
        alerts: Array.from({ length: 9 }, (_, i) =>
          alert({ id: `alert-${i}`, severity: 'critical', title: `Critical ${i}` }),
        ),
      }),
    );
    expect(events).toHaveLength(KEY_EVENT_LIMIT);
  });

  it('collapses one fact reported by two sources into a single entry', () => {
    // The whale-context item and the alert it was built from share an id.
    const events = buildKeyEvents(
      baseInput({
        whales: [whale({ alertId: 'alert-1' })],
        alerts: [alert({ id: 'alert-1', severity: 'critical' })],
      }),
    );
    expect(events).toHaveLength(1);
    // The richer (decisiveness-carrying) phrasing is the survivor.
    expect(events[0].text).toContain('without that power the winner is');
  });

  it('collapses a quorum_risk alert into the at-risk open vote it was raised for', () => {
    const events = buildKeyEvents(
      baseInput({
        upcoming: [openVote()],
        alerts: [
          alert({
            id: 'alert-9',
            type: 'quorum_risk',
            proposalTitle: 'Fee switch activation',
            title: 'Quorum at risk',
          }),
        ],
      }),
    );
    expect(events).toHaveLength(1);
  });

  it('orders by weight: a decisive open-vote whale outranks a critical alert', () => {
    const events = buildKeyEvents(
      baseInput({
        whales: [whale({ alertId: 'whale-alert' })],
        alerts: [alert({ id: 'other-alert', severity: 'critical', title: 'Coordinated cluster' })],
      }),
    );
    expect(events).toHaveLength(2);
    expect(events[0].text).toContain('Fee switch activation');
    expect(events[1].text).toContain('Coordinated cluster');
  });

  it('is deterministic — identical input yields an identical list', () => {
    const input = baseInput({
      whales: [whale()],
      alerts: [alert({ id: 'a', severity: 'critical' }), alert({ id: 'b' })],
      upcoming: [openVote({ id: 'prop-2', title: 'Other' })],
      attribution: attributed(-3),
    });
    expect(buildKeyEvents(input)).toEqual(buildKeyEvents(input));
  });
});

// ===========================================================================
// proseIsSafe — the guard that makes an LLM acceptable here at all
// ===========================================================================

describe('proseIsSafe', () => {
  const summary = buildExecutiveSummary(
    baseInput({ upcoming: [openVote()], attribution: attributed(-3) }),
  );
  const facts = summaryFacts(summary);

  it('accepts a clean paraphrase that only uses numbers present in the facts', () => {
    const prose =
      'Governance risk is elevated at Uniswap this week. One open vote, the fee switch activation, is at 62% of quorum with 3d left in its voting window. The Democracy Score moved -3.00 points to 68.00. No whale vote was decisive to any outcome.';
    expect(proseIsSafe(prose, facts)).toBe(true);
  });

  it('rejects a hallucinated number', () => {
    const prose =
      'Governance risk is elevated at Uniswap this week. One open vote is at 47.3% of quorum, which is well behind schedule for the deadline.';
    expect(proseIsSafe(prose, facts)).toBe(false);
  });

  it('rejects an invented count even when everything else is true', () => {
    const prose =
      'Governance risk is elevated at Uniswap this week, with 14 open votes short of quorum across the DAO and no decisive whale votes recorded.';
    expect(proseIsSafe(prose, facts)).toBe(false);
  });

  it('rejects empty and whitespace-only output', () => {
    expect(proseIsSafe('', facts)).toBe(false);
    expect(proseIsSafe('   \n  \t ', facts)).toBe(false);
  });

  it('rejects a fragment shorter than the minimum', () => {
    expect('Risk is elevated.'.length).toBeLessThan(MIN_PROSE_CHARS);
    expect(proseIsSafe('Risk is elevated.', facts)).toBe(false);
  });

  it('rejects absurdly long output', () => {
    const prose = `Governance risk is elevated at Uniswap this week. ${'The situation is stable and unchanged. '.repeat(
      60,
    )}`;
    expect(prose.length).toBeGreaterThan(MAX_PROSE_CHARS);
    expect(proseIsSafe(prose, facts)).toBe(false);
  });

  it('rejects headings and code fences, which would break out of the section', () => {
    expect(
      proseIsSafe(
        '# Executive summary\nGovernance risk is elevated at Uniswap this week and nothing else fired.',
        facts,
      ),
    ).toBe(false);
    expect(
      proseIsSafe(
        '```\nGovernance risk is elevated at Uniswap this week and nothing else fired.\n```',
        facts,
      ),
    ).toBe(false);
  });

  it('compares values, not formatting — thousands separators and trailing zeros are fine', () => {
    const serialised = JSON.stringify({ note: 'total was 1234 and the share was 62' });
    expect(
      proseIsSafe('The recorded total was 1,234 and the share was 62.00 percent exactly.', serialised),
    ).toBe(true);
  });

  it('accepts prose containing no numbers at all', () => {
    expect(
      proseIsSafe(
        'Governance risk is elevated this week at Uniswap, driven by an open vote that is behind on quorum.',
        facts,
      ),
    ).toBe(true);
  });

  it('holds for our own deterministic prose — the fallback would never be rejected', () => {
    for (const s of [
      buildExecutiveSummary(baseInput()),
      buildExecutiveSummary(
        baseInput({
          whales: [whale()],
          alerts: [alert({ severity: 'critical' }), alert({ id: 'b', type: 'last_minute_swing' })],
          upcoming: [openVote(), openVote({ id: 'prop-2', title: 'Other' })],
          attribution: attributed(-7),
        }),
      ),
    ]) {
      expect(proseIsSafe(renderDeterministicSummary(s), summaryFacts(s))).toBe(true);
    }
  });
});

// ===========================================================================
// The AI call — fallback-first
// ===========================================================================

describe('writeExecutiveSummaryProse', () => {
  const summary = buildExecutiveSummary(baseInput({ upcoming: [openVote()] }));
  const deterministic = renderDeterministicSummary(summary);

  beforeEach(() => chatMock.mockReset());

  it('makes no network call and returns the deterministic prose when useAi is false', async () => {
    await expect(writeExecutiveSummaryProse(summary, { useAi: false })).resolves.toBe(deterministic);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('falls back when chat() returns null (no API key, HTTP error, thrown request)', async () => {
    chatMock.mockResolvedValue(null);
    await expect(writeExecutiveSummaryProse(summary)).resolves.toBe(deterministic);
  });

  it('falls back when chat() succeeds with an EMPTY completion', async () => {
    // The reason the check is `r?.text` and not `!r`.
    chatMock.mockResolvedValue({ text: '' });
    await expect(writeExecutiveSummaryProse(summary)).resolves.toBe(deterministic);
  });

  it('falls back when the model output fails the guard', async () => {
    chatMock.mockResolvedValue({
      text: 'Governance risk is elevated. The vote sits at 91.4% of quorum and will almost certainly pass.',
    });
    await expect(writeExecutiveSummaryProse(summary)).resolves.toBe(deterministic);
  });

  it('publishes model prose that passes the guard', async () => {
    const clean =
      'Governance risk is elevated at Uniswap this week. One open vote, the fee switch activation, stands at 62% of quorum with 3d left. No whale vote decided an outcome.';
    chatMock.mockResolvedValue({ text: `  ${clean}  ` });
    await expect(writeExecutiveSummaryProse(summary)).resolves.toBe(clean);
  });

  it('sends the model the fact JSON and a low token budget', async () => {
    chatMock.mockResolvedValue(null);
    await writeExecutiveSummaryProse(summary);
    const call = chatMock.mock.calls[0][0];
    expect(call.maxTokens).toBe(500);
    expect(call.messages[0].role).toBe('system');
    expect(JSON.parse(call.messages[1].content)).toEqual(summaryFacts(summary));
  });
});

// ===========================================================================
// Markdown
// ===========================================================================

describe('formatExecutiveSummarySection', () => {
  it('always renders, states the level, and never omits the drivers', () => {
    const s = buildExecutiveSummary(baseInput({ upcoming: [openVote()] }));
    const md = formatExecutiveSummarySection(s, renderDeterministicSummary(s));
    expect(md.startsWith('\n\n## 🧭 Executive summary')).toBe(true);
    expect(md).toContain('Governance risk: ELEVATED');
    expect(md).toContain('**Why this level:**');
    expect(md).toContain('`quorum_at_risk`');
  });

  it('states what was checked on a quiet week rather than rendering an empty section', () => {
    const s = buildExecutiveSummary(baseInput());
    const md = formatExecutiveSummarySection(s, renderDeterministicSummary(s));
    expect(md).toContain('Governance risk: LOW');
    expect(md).toContain('No risk condition fired');
    // No key events happened, so no key-events block is emitted at all.
    expect(md).not.toContain('**Key events:**');
  });

  it('emits exactly as many key-event bullets as there were events', () => {
    const s = buildExecutiveSummary(
      baseInput({ alerts: [alert({ id: 'a', severity: 'critical' }), alert({ id: 'b' })] }),
    );
    const md = formatExecutiveSummarySection(s, 'prose');
    const bullets = md.slice(md.indexOf('**Key events:**')).split('\n').filter((l) => l.startsWith('- '));
    expect(bullets).toHaveLength(s.keyEvents.length);
    expect(s.keyEvents).toHaveLength(2);
  });

  it('distinguishes its scale from the per-proposal AI risk rating', () => {
    const s = buildExecutiveSummary(baseInput());
    const md = formatExecutiveSummarySection(s, 'prose');
    expect(md).toContain('low / elevated / high');
    expect(md).toContain('low / medium / high AI risk rating');
  });
});
