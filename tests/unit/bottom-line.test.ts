import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  bottomLineFacts,
  formatBottomLineSection,
  renderDeterministicBottomLine,
  writeBottomLineProse,
  type BottomLineFacts,
} from '@/server/services/org-report/bottom-line';
import { buildExecutiveSummary, type ExecutiveSummaryInput } from '@/server/services/org-report/executive-summary';
import type { Recommendation } from '@/server/services/org-report/recommendations';
import type { UpcomingProposalItem } from '@/server/services/org-report/upcoming-quorum';

// Same mocking convention as executive-summary.test.ts: the module under
// test makes its own `chat()` call, so it's mocked here too rather than
// reusing whatever the executive-summary suite configured.
const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('@/server/ai/openrouter', () => ({ chat: chatMock }));

const WEEK_OF = new Date('2026-07-06T00:00:00Z');
const DEADLINE = new Date('2026-07-09T00:00:00Z');

function baseInput(over: Partial<ExecutiveSummaryInput> = {}): ExecutiveSummaryInput {
  return { organizationName: 'Acme Governance', daoName: 'Uniswap', weekStart: WEEK_OF, ...over };
}

// Same fixture as executive-summary.test.ts — copied rather than imported
// since it isn't exported from there.
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

function recommendation(over: Partial<Recommendation> = {}): Recommendation {
  return {
    ruleId: 'quorum_push',
    subject: 'prop-1',
    priority: 'high',
    action: 'Push turnout on "Fee switch activation" before it closes.',
    evidence: '"Fee switch activation" is at 62% of quorum with 3d left.',
    deadline: DEADLINE,
    owner: 'delegate_relations',
    riskLabel: 'Quorum at risk',
    subjectLabel: 'Fee switch activation',
    ...over,
  };
}

const NO_ACTION: Recommendation = recommendation({
  ruleId: 'no_action_needed',
  action: 'No action needed this week.',
  evidence: 'Nothing reviewed triggered a rule.',
  deadline: null,
  priority: 'low',
});

// ===========================================================================
// bottomLineFacts
// ===========================================================================

describe('bottomLineFacts', () => {
  it('takes the highest-severity driver and the highest-priority actionable recommendation', () => {
    const summary = buildExecutiveSummary(baseInput({ upcoming: [openVote()] }));
    const recs = [NO_ACTION, recommendation()];
    const facts = bottomLineFacts(summary, recs);

    expect(facts.organization).toBe('Acme Governance');
    expect(facts.dao).toBe('Uniswap');
    expect(facts.riskLevel).toBe(summary.riskLevel);
    expect(facts.topDriver).toBe(summary.drivers[0]?.detail ?? null);
    expect(facts.topRecommendation).toEqual({
      action: recommendation().action,
      subjectLabel: 'Fee switch activation',
      owner: 'Delegate relations',
      deadline: '2026-07-09',
    });
  });

  it('reports null driver and null recommendation on a genuinely quiet week', () => {
    const summary = buildExecutiveSummary(baseInput());
    const facts = bottomLineFacts(summary, [NO_ACTION]);

    expect(facts.topDriver).toBeNull();
    expect(facts.topRecommendation).toBeNull();
  });
});

// ===========================================================================
// renderDeterministicBottomLine
// ===========================================================================

describe('renderDeterministicBottomLine', () => {
  it('names the top driver and the top recommendation', () => {
    const facts: BottomLineFacts = {
      organization: 'Acme Governance',
      dao: 'Uniswap',
      riskLevel: 'elevated',
      topDriver: 'a whale cast 21.4% of the vote',
      scoreDelta: -3.5,
      topRecommendation: {
        action: 'Push turnout before it closes.',
        subjectLabel: 'Fee switch activation',
        owner: 'Delegate relations',
        deadline: '2026-07-09',
      },
    };
    const text = renderDeterministicBottomLine(facts);
    expect(text).toContain('a whale cast 21.4% of the vote');
    expect(text).toContain('3.50 points');
    expect(text).toContain('Push turnout before it closes.');
    expect(text).toContain('by 2026-07-09');
  });

  it('reads as a genuinely quiet week when there is no driver or recommendation', () => {
    const facts: BottomLineFacts = {
      organization: 'Acme Governance',
      dao: 'Uniswap',
      riskLevel: 'low',
      topDriver: null,
      scoreDelta: null,
      topRecommendation: null,
    };
    const text = renderDeterministicBottomLine(facts);
    expect(text).toContain('No risk condition fired for Uniswap this week');
    expect(text).toContain('No specific action is recommended this week.');
  });
});

// ===========================================================================
// The AI call — fallback-first
// ===========================================================================

describe('writeBottomLineProse', () => {
  const summary = buildExecutiveSummary(baseInput({ upcoming: [openVote()] }));
  const recs = [recommendation()];
  const deterministic = renderDeterministicBottomLine(bottomLineFacts(summary, recs));

  beforeEach(() => chatMock.mockReset());

  it('makes no network call and returns the deterministic prose when useAi is false', async () => {
    await expect(writeBottomLineProse(summary, recs, { useAi: false })).resolves.toBe(deterministic);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('falls back when chat() returns null (no API key, HTTP error, thrown request)', async () => {
    chatMock.mockResolvedValue(null);
    await expect(writeBottomLineProse(summary, recs)).resolves.toBe(deterministic);
  });

  it('falls back when chat() succeeds with an EMPTY completion', async () => {
    chatMock.mockResolvedValue({ text: '' });
    await expect(writeBottomLineProse(summary, recs)).resolves.toBe(deterministic);
  });

  it('falls back when the model output fails the guard (hallucinated number)', async () => {
    chatMock.mockResolvedValue({
      text: 'The most pressing issue is a vote sitting at 91.4% of quorum, almost certain to pass.',
    });
    await expect(writeBottomLineProse(summary, recs)).resolves.toBe(deterministic);
  });

  it('publishes model prose that passes the guard', async () => {
    const clean =
      'The fee switch activation vote is the thing to watch this week. Push turnout before it closes on 2026-07-09.';
    chatMock.mockResolvedValue({ text: `  ${clean}  ` });
    await expect(writeBottomLineProse(summary, recs)).resolves.toBe(clean);
  });

  it('sends the model the fact JSON and a low token budget', async () => {
    chatMock.mockResolvedValue(null);
    await writeBottomLineProse(summary, recs);
    const call = chatMock.mock.calls[0][0];
    expect(call.maxTokens).toBe(300);
    expect(call.messages[0].role).toBe('system');
    expect(JSON.parse(call.messages[1].content)).toEqual(bottomLineFacts(summary, recs));
  });
});

// ===========================================================================
// Markdown
// ===========================================================================

describe('formatBottomLineSection', () => {
  it('renders a rule, a bold lead-in, and the prose verbatim', () => {
    const md = formatBottomLineSection('This is the closing paragraph.');
    expect(md).toBe('\n\n---\n\n**Bottom line.** This is the closing paragraph.');
  });
});
