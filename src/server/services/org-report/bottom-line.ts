/**
 * The AI-written closing paragraph for the PAID org-scoped weekly report.
 *
 * Same discipline as `executive-summary.ts`, which this deliberately mirrors:
 * the only thing an LLM does here is rephrase an already-verified fact object
 * into one short paragraph, gated by the same `proseIsSafe` guard that
 * rejects any output citing a number the facts do not contain. On any
 * rejection — or when the AI call is off, missing a key, or fails — the
 * deterministic fallback ships instead. Nothing here is inferred; everything
 * is read straight off `ExecutiveSummary`/`Recommendation[]`, which are
 * already assembled by the time this runs.
 *
 * Separate module (not folded into `executive-summary.ts`) and a separate
 * `chat()` call, matching the one-concern-per-file convention in this
 * directory and keeping both prompts single-purpose and independently
 * testable.
 */

import { chat } from '../../ai/openrouter';
import { proseIsSafe, type ExecutiveSummary } from './executive-summary';
import { OWNER_LABEL, type Recommendation } from './recommendations';

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export interface BottomLineTopRecommendation {
  action: string;
  subjectLabel: string;
  owner: string;
  deadline: string | null;
}

/** The JSON handed to the model — and the only thing `proseIsSafe` will accept numbers from. */
export interface BottomLineFacts {
  organization: string;
  dao: string;
  riskLevel: ExecutiveSummary['riskLevel'];
  /** Highest-severity driver's detail, or null on a quiet ("low") week. */
  topDriver: string | null;
  /** Democracy Score move, when the attribution behind it could be stood behind. */
  scoreDelta: number | null;
  /** Highest-priority actionable recommendation, or null when there is none. */
  topRecommendation: BottomLineTopRecommendation | null;
}

/** The exact fact set the model is shown. Pure — no DB, no clock. */
export function bottomLineFacts(
  summary: ExecutiveSummary,
  recommendations: readonly Recommendation[],
): BottomLineFacts {
  const top = recommendations.find((r) => r.ruleId !== 'no_action_needed') ?? null;

  return {
    organization: summary.organizationName,
    dao: summary.daoName,
    riskLevel: summary.riskLevel,
    // `summary.drivers` is already ordered highest-severity-first (see
    // executive-summary.ts); the first entry is the single most important
    // finding, which is exactly what a one-paragraph closer needs to name.
    topDriver: summary.drivers[0]?.detail ?? null,
    scoreDelta: summary.score?.delta ?? null,
    topRecommendation: top
      ? {
          action: top.action,
          subjectLabel: top.subjectLabel,
          owner: OWNER_LABEL[top.owner],
          deadline: top.deadline ? top.deadline.toISOString().slice(0, 10) : null,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Deterministic prose — the fallback, and the baseline the model has to beat
// ---------------------------------------------------------------------------

/** Plain, correct-by-construction closer built straight from `BottomLineFacts`. */
export function renderDeterministicBottomLine(facts: BottomLineFacts): string {
  const sentences: string[] = [];

  sentences.push(
    facts.topDriver
      ? `The most significant finding this week: ${facts.topDriver}`
      : `No risk condition fired for ${facts.dao} this week`,
  );

  if (facts.scoreDelta !== null && facts.scoreDelta !== 0) {
    const direction = facts.scoreDelta > 0 ? 'rose' : 'fell';
    sentences.push(`the Democracy Score ${direction} ${Math.abs(facts.scoreDelta).toFixed(2)} points`);
  }

  const lead = `${sentences.join(', while ')}.`;

  const next = facts.topRecommendation
    ? ` ${facts.topRecommendation.action}${facts.topRecommendation.deadline ? ` by ${facts.topRecommendation.deadline}` : ''}.`
    : ' No specific action is recommended this week.';

  return lead + next;
}

// ---------------------------------------------------------------------------
// The one AI call
// ---------------------------------------------------------------------------

export const BOTTOM_LINE_SYSTEM_PROMPT = `You are writing the closing paragraph of a paid weekly DAO governance report.

You will be given a JSON object of facts that have ALREADY been verified and printed, in full, elsewhere in the same report. Write a short closing paragraph that ties the report together.

Rules:
- 2-4 sentences, under 100 words, one paragraph.
- State the single most important finding (from the JSON), then — only if the JSON includes one — the concrete next step.
- You may NOT introduce any number, name, date, percentage or claim that is not present in the JSON. Every figure you write must appear in the JSON exactly.
- Do not speculate about how a vote will end, do not forecast, do not estimate a probability.
- Do not restate the whole report or list events one by one — synthesize to a single throughline.
- No pricing, no pitch, no call-to-action beyond what the JSON's recommendation already says.
- No headings, no bullet points, no markdown formatting, no code fences.`;

export interface BottomLineProseOptions {
  /**
   * `false` forces the deterministic text and makes no network call. Exposed
   * so callers and tests can pin the report to byte-reproducible output —
   * same contract as `ExecutiveSummaryProseOptions['useAi']`.
   */
  useAi?: boolean;
}

/**
 * Deterministic-first: the fallback is computed and held, the model is asked
 * for a nicer phrasing, and its answer is used ONLY if `proseIsSafe` clears
 * it. `r?.text` is the truthiness check, not `!r` — `chat()` resolves to
 * `{ text: '' }` on a successful-but-empty completion, and `!r` would happily
 * publish that empty string as the closing paragraph of a paid report.
 */
export async function writeBottomLineProse(
  summary: ExecutiveSummary,
  recommendations: readonly Recommendation[],
  opts: BottomLineProseOptions = {},
): Promise<string> {
  const prose = renderDeterministicBottomLine(bottomLineFacts(summary, recommendations));
  if (opts.useAi === false) return prose;

  const facts = bottomLineFacts(summary, recommendations);
  const serialisedFacts = JSON.stringify(facts, null, 2);
  const r = await chat({
    maxTokens: 300,
    temperature: 0.2,
    messages: [
      { role: 'system', content: BOTTOM_LINE_SYSTEM_PROMPT },
      { role: 'user', content: serialisedFacts },
    ],
  });

  // `proseIsSafe` accepts a pre-serialised facts string as well as the typed
  // object it was written for — used here rather than duplicating the guard,
  // since `BottomLineFacts` is a different shape from `ExecutiveSummaryFacts`.
  // It already enforces MIN_PROSE_CHARS/MAX_PROSE_CHARS internally.
  if (r?.text && proseIsSafe(r.text, serialisedFacts)) return r.text.trim();
  return prose;
}

// ---------------------------------------------------------------------------
// Markdown (pure)
// ---------------------------------------------------------------------------

/**
 * Same `\n\n---\n\n` rule convention `formatMethodologyFooter` uses
 * (index.ts) — this section is the very last thing in the report body.
 */
export function formatBottomLineSection(prose: string): string {
  return `\n\n---\n\n**Bottom line.** ${prose}`;
}
