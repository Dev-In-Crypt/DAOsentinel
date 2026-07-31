/**
 * TODO-081: chart data for the paid report's PDF-only "Visual summary" block.
 *
 * Pure derivation over data the report has ALREADY fetched — `upcoming` (from
 * upcoming-quorum.ts) and `attribution` (from score-attribution.ts). No DB, no
 * network, no second query.
 *
 * This module exists because `renderDigestPdf` is handed markdown and has no
 * numbers of its own. Drawing a quorum meter from the rendered prose would
 * mean regex-recovering figures out of sentences we wrote ourselves, which
 * `fb817aa` declined to do; the numbers are threaded explicitly instead.
 *
 * Both builders deliberately mirror a filter the corresponding markdown
 * formatter already applies, so a chart can never assert something the text
 * of the same report declines to say.
 */

import type { AttributionBarInput, QuorumMeterInput } from '@/lib/pdf/digest-pdf';
import type { ScoreAttribution } from './score-attribution';
import type { UpcomingProposalItem } from './upcoming-quorum';

export interface OrgReportVisuals {
  quorumMeters: QuorumMeterInput[];
  attributionBars: AttributionBarInput[];
}

/**
 * One meter per open vote that has a published quorum figure.
 *
 * Excludes `not_yet_open` items (voting has not started, so there is no
 * fraction to draw and a 0%-wide bar would read as "this vote is failing")
 * and `not_published` quorum (no denominator — the same reason
 * `formatQuorumLine` prints a reason string instead of a percentage for those
 * rows; every Tally-sourced proposal lands here by design).
 *
 * No limit is applied: `fetchUpcomingWithQuorum` already caps the list at
 * `UPCOMING_LIMIT`, and silently truncating further would make the chart
 * disagree with the section below it.
 */
export function buildQuorumMeters(upcoming: readonly UpcomingProposalItem[]): QuorumMeterInput[] {
  const meters: QuorumMeterInput[] = [];
  for (const item of upcoming) {
    if (item.phase !== 'open') continue;
    if (item.quorum.status === 'not_published') continue;
    meters.push({ label: item.title, pct: item.quorum.pct, status: item.quorum.status });
  }
  return meters;
}

/**
 * One bar per metric that actually moved the Democracy Score.
 *
 * Mirrors `formatScoreAttributionSection`'s own `movers` filter
 * (`contribution !== 0`), and returns `[]` for every `unavailable` status —
 * where the text withholds a decomposition it cannot stand behind, the chart
 * must withhold it too. Driver order is preserved: `attributeScoreChange`
 * has already sorted them by |contribution| with a deterministic tie-break.
 */
export function buildAttributionBars(attribution: ScoreAttribution): AttributionBarInput[] {
  if (attribution.status !== 'attributed') return [];
  return attribution.drivers
    .filter((d) => d.contribution !== 0)
    .map((d) => ({ label: d.label, contribution: d.contribution }));
}

/** Both charts for one report. Always returns arrays — never undefined — so a quiet week is an empty block, not a missing key. */
export function buildOrgReportVisuals(
  upcoming: readonly UpcomingProposalItem[],
  attribution: ScoreAttribution,
): OrgReportVisuals {
  return {
    quorumMeters: buildQuorumMeters(upcoming),
    attributionBars: buildAttributionBars(attribution),
  };
}
