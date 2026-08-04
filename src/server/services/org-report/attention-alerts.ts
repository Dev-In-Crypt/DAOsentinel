/**
 * TODO-064: "Alerts requiring attention" section for the PAID org-scoped
 * weekly report.
 *
 * The alert pipeline emits five types (whale_vote, last_minute_swing,
 * quorum_risk, coordinated_voting, score_drop) but the weekly report body
 * built by `generateOrgDigestBody` only ever surfaced `whale_vote` — the
 * other four are computed, stored in `alerts`, and never shown to the
 * customer. This module produces the missing section.
 *
 * Split follows the house pattern for DB-touching services: the query lives
 * in `fetchAttentionAlerts`, everything that turns a row into customer-facing
 * prose is pure and unit-testable without a database (same discipline as
 * `formatOrgReportCsv` in src/lib/org-report-csv.ts, `findAccessibleOrg` in
 * src/server/api/org-auth.ts, and `formatFallback` /
 * `formatCuratedNotesSection` in src/server/services/digest-generator.ts).
 *
 * Wiring the section into the report body happens separately — this module
 * deliberately does not touch digest-generator.ts.
 *
 * IMPORTANT: `alerts.data` is untyped `jsonb` (`Record<string, unknown>`).
 * Its shape is a convention held up only by the detector code that writes it,
 * so every read below goes through a narrowing helper. A malformed, missing,
 * or unexpected payload degrades to a still-useful item (title, description
 * and severity always survive) — it must never throw, because one bad row
 * would otherwise take down the whole paid weekly report.
 */

import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import { alerts, proposals } from '../../db/schema';
import { normalizeProposalTitle, shortenAddress } from '@/lib/utils';
import { hasVotingClosed } from '@/lib/proposal-status';
import { escapeMarkdown } from '@/lib/pdf/digest-pdf';

/** Every alert type any service currently inserts. */
export const ATTENTION_ALERT_TYPES = [
  'whale_vote',
  'last_minute_swing',
  'quorum_risk',
  'coordinated_voting',
  'score_drop',
] as const;

export type AttentionAlertType = (typeof ATTENTION_ALERT_TYPES)[number];

/**
 * Severities worth a customer's time. `info` (sub-threshold whale votes) is
 * excluded deliberately — this section is an action list, not an archive.
 */
export const ACTIONABLE_SEVERITIES = ['critical', 'warning'] as const;

/** Cap on how many alerts the section carries, so a noisy week stays readable. */
export const ATTENTION_ALERT_LIMIT = 12;

/** How many coordinated-voting addresses to name before collapsing to "+N more". */
const MAX_LISTED_ADDRESSES = 5;

/**
 * One `alerts` row plus the joined proposal context, as handed to the pure
 * layer. `data` is intentionally `unknown`: the column's declared
 * `Record<string, unknown>` type is a promise the database does not keep.
 */
export interface AttentionAlertRow {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  data: unknown;
  createdAt: Date;
  /** Null for `score_drop`, which is DAO-level and has no proposal. */
  proposalId: string | null;
  proposalTitle: string | null;
  proposalChoices: string[] | null;
  proposalState: string | null;
  proposalEndsAt: Date | null;
}

/** Customer-facing shape: what happened, why it matters, who, and by when. */
export interface AttentionAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  whatHappened: string;
  whyItMatters: string;
  participants: string;
  /** Voting deadline of the linked proposal; null for DAO-level alerts. */
  deadline: Date | null;
  /**
   * Whether that deadline had already passed when the report was generated.
   *
   * An alert is a record of the moment it fired, but the report is written
   * later — on a Friday first view, a Monday quorum warning can be five days
   * stale. Without this the section printed "Deadline: <past date>" next to
   * advice about acting before the vote closes. False for DAO-level alerts,
   * which have no deadline to pass.
   */
  deadlinePassed: boolean;
  proposalTitle: string | null;
  createdAt: Date;
  /** Lowercased voter address for `whale_vote`; null for every other type. */
  voter: string | null;
  /** The proposal title with trailing clone tags stripped — part of the dedupe key. */
  normalizedTitle: string;
  /**
   * The raw choice index from the payload, as a string. Part of the dedupe key
   * and deliberately NOT the rendered choice text: the same choice can render
   * differently across clones, and the percentage embedded in `participants`
   * differs on every clone by a decimal or two — keying on that text meant
   * nothing ever matched and no clone was ever collapsed.
   */
  choiceKey: string;
  /**
   * How many near-identical alerts this one stands for, beyond itself. `0`
   * means it is the only one. Surfaced in the text rather than silently
   * dropped: "also on 3 near-identical clones" is information, a missing
   * alert is a hole.
   */
  collapsedCount: number;
}

// =============================================
// Defensive jsonb narrowing
// =============================================

/** Anything that is not a plain object becomes `{}` — arrays and null included. */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** Non-empty string, or null. Numbers are accepted and stringified. */
function readString(data: Record<string, unknown>, key: string): string | null {
  const raw = data[key];
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
}

/** Finite number, or null. Numeric strings are accepted (jsonb numerics round-trip). */
function readNumber(data: Record<string, unknown>, key: string): number | null {
  const raw = data[key];
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Finite integer index, or null. Rejects 1.5, "abc", true, objects. */
function readIndex(data: Record<string, unknown>, key: string): number | null {
  const n = readNumber(data, key);
  return n !== null && Number.isInteger(n) ? n : null;
}

/** Array of non-empty strings, filtering out any non-string members. */
function readStringArray(data: Record<string, unknown>, key: string): string[] {
  const raw = data[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

/**
 * Resolves a choice index against `proposals.choices`. Detectors are
 * inconsistent about the base: `last_minute_swing` stores 0-indexed leaders,
 * while `whale_vote`/`coordinated_voting` copy `votes.choice`, which is
 * 1-indexed. Out-of-range or missing choices fall back to the raw index so
 * the customer still sees *something* identifiable.
 */
function resolveChoice(
  index: number | null,
  choices: string[] | null,
  base: 0 | 1,
): string | null {
  if (index === null) return null;
  const label = choices?.[index - base];
  if (typeof label === 'string' && label.trim() !== '') return label;
  return `choice #${index}`;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

// =============================================
// Per-type explanations
// =============================================

const NO_INDIVIDUALS_PROPOSAL =
  'No individual voters — this is a proposal-level signal about turnout, not about any one address.';
const NO_INDIVIDUALS_DAO =
  'No individual voters — this is a DAO-level metric covering the whole week of governance activity.';

/**
 * Why a DAO ops team should care, per type. Factual and specific — this is
 * the part of the section a paying customer is actually buying, so it says
 * what the signal implies operationally rather than restating the numbers.
 */
function whyItMattersFor(type: string, closed = false): string {
  // Two of these types tell the reader to act before the vote closes. Once it
  // HAS closed that advice is not merely useless, it is wrong — so they get a
  // retrospective variant. The other three are already written in past tense
  // (a swing that happened, a cluster that voted, a score that fell) and read
  // correctly either way.
  if (closed) {
    switch (type) {
      case 'whale_vote':
        return 'This vote has closed, so the outcome is fixed and there is no counterparty left to engage. What is still worth recording is who decided it, and whether one address holding this share of the vote is expected for this DAO or is something to raise before the next proposal of the same kind.';
      case 'quorum_risk':
        return 'This vote has closed, so no turnout push can change it now. The value left in it is the pattern: which proposals keep coming up short on turnout, and whether delegate outreach started early enough to have made a difference if it had run.';
    }
  }

  switch (type) {
    case 'whale_vote':
      return 'A single address holding this share of voting power can carry or sink the proposal on its own, which means the outcome is decided by one counterparty rather than by turnout. If their position differs from yours, the window to engage them is before voting closes — after that the result is fixed.';
    case 'last_minute_swing':
      return 'The leading option changed late in the voting window, after most participants had stopped watching. Late flips are the pattern most likely to produce an outcome the community did not expect and did not have time to respond to, and they are worth reconstructing before the next vote of the same kind.';
    case 'quorum_risk':
      return 'Below quorum the proposal fails no matter how the votes split — a comfortable "for" majority still dies. The lever here is turnout, not persuasion: delegate outreach and a reminder push are what change the result, and both need lead time before the deadline.';
    case 'coordinated_voting':
      return 'Several addresses voted the same way with near-identical voting power inside a tight window — the shape of a split treasury, a delegate bloc, or a Sybil cluster. It may be entirely legitimate, but it inflates the apparent breadth of support, so consensus on this proposal is narrower than the raw voter count suggests.';
    case 'score_drop':
      return 'The Democracy Score fell against last week, meaning a measured component of governance health — participation, decentralization of voting power, or proposal transparency — got worse rather than staying flat. Check which component moved before the drop compounds across the next cycle.';
    default:
      return 'This alert crossed the detector threshold for its type. Review it directly, since it does not match any of the standard alert categories the report explains.';
  }
}

/**
 * Who took part, per type. Extracted from the untyped `data` payload; when
 * the payload cannot supply names, this says so plainly rather than emitting
 * an empty field that reads like a bug to the customer.
 */
function participantsFor(row: AttentionAlertRow): string {
  const data = asRecord(row.data);

  switch (row.type) {
    case 'whale_vote': {
      const voter = readString(data, 'voter');
      const vpPct = readNumber(data, 'vpPct');
      const choiceLabel =
        readString(data, 'choiceLabel') ??
        resolveChoice(readIndex(data, 'choice'), row.proposalChoices, 1);

      if (!voter) return 'Voter address missing from the alert payload.';

      const parts: string[] = [shortenAddress(voter)];
      if (vpPct !== null) parts.push(`${formatPct(vpPct)} of voting power`);
      if (choiceLabel) parts.push(`voted "${choiceLabel}"`);
      return parts.join(' — ');
    }

    case 'coordinated_voting': {
      const voters = readStringArray(data, 'voters');
      if (voters.length === 0) return 'Voter addresses missing from the alert payload.';

      const shown = voters.slice(0, MAX_LISTED_ADDRESSES).map((v) => shortenAddress(v));
      const overflow = voters.length - shown.length;
      const list = overflow > 0 ? `${shown.join(', ')} (+${overflow} more)` : shown.join(', ');
      const choiceLabel = resolveChoice(readIndex(data, 'choice'), row.proposalChoices, 1);

      const cluster = `${voters.length} address${voters.length === 1 ? '' : 'es'}: ${list}`;
      return choiceLabel ? `${cluster} — all voted "${choiceLabel}"` : cluster;
    }

    case 'last_minute_swing': {
      const from = resolveChoice(readIndex(data, 'previousLeader'), row.proposalChoices, 0);
      const to = resolveChoice(readIndex(data, 'currentLeader'), row.proposalChoices, 0);
      if (!from && !to) return 'Leading choices missing from the alert payload.';
      return `Leading choice flipped from "${from ?? 'unknown'}" to "${to ?? 'unknown'}"`;
    }

    case 'quorum_risk':
      return NO_INDIVIDUALS_PROPOSAL;

    case 'score_drop':
      return NO_INDIVIDUALS_DAO;

    default:
      return 'No participant detail available for this alert type.';
  }
}

// =============================================
// Pure core
// =============================================

/**
 * Turns one raw alert row into a customer-facing item. Pure, total, and
 * never throws: `whatHappened` falls back to the alert title when the
 * detector wrote an empty description, and every `data` read is narrowed.
 */
export function describeAlert(row: AttentionAlertRow, now: Date = new Date()): AttentionAlert {
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  const title = typeof row.title === 'string' && row.title.trim() !== '' ? row.title : 'Alert';
  // Only proposal-linked alerts carry a deadline; `score_drop` never does.
  const deadline = row.proposalId ? row.proposalEndsAt : null;
  const deadlinePassed = hasVotingClosed(deadline, now);

  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title,
    whatHappened: description !== '' ? description : title,
    whyItMatters: whyItMattersFor(row.type, deadlinePassed),
    participants: participantsFor(row),
    deadline,
    deadlinePassed,
    proposalTitle: row.proposalId ? row.proposalTitle : null,
    createdAt: row.createdAt,
    voter: row.type === 'whale_vote' ? readString(asRecord(row.data), 'voter')?.toLowerCase() ?? null : null,
    normalizedTitle: normalizeProposalTitle(row.proposalTitle),
    choiceKey: String(readIndex(asRecord(row.data), 'choice') ?? ''),
    collapsedCount: 0,
  };
}

/** `critical` first, then everything else; ties broken most-recent-first. */
function severityRank(severity: string): number {
  return severity === 'critical' ? 0 : 1;
}

function createdAtMs(value: Date): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Describes and orders a batch. The SQL in `fetchAttentionAlerts` already
 * orders identically; re-sorting here keeps the pure layer self-contained
 * (and testable) rather than depending on the caller's query.
 */
/**
 * How many `whale_vote` alerts to show for any one proposal. A contentious
 * vote can draw a dozen whales; on real data (Aavegotchi) that filled the
 * entire section with the same boilerplate twelve times and pushed every
 * other alert type out of the report. The rest are counted, not hidden.
 */
export const MAX_WHALE_ALERTS_PER_PROPOSAL = 2;

export function describeAlerts(
  rows: AttentionAlertRow[],
  now: Date = new Date(),
): AttentionAlert[] {
  const sorted = rows
    .map((row) => describeAlert(row, now))
    .sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        createdAtMs(b.createdAt) - createdAtMs(a.createdAt),
    );

  // Two passes, in this order:
  //
  // 1. Collapse the SAME whale casting the SAME vote across clones of one
  //    proposal into a single item. Keying on `proposalTitle` (as this did
  //    until TODO-075) does not catch them, because clone titles differ by
  //    their suffix — which is how one whale's one decision printed four
  //    times, and why the section ran to eight near-identical blocks.
  // 2. Only then apply the per-proposal cap, so the cap is spent on
  //    *different* whales rather than on repeats of one.
  const byIdentity = new Map<string, AttentionAlert>();
  const collapsed: AttentionAlert[] = [];
  for (const alert of sorted) {
    if (alert.type !== 'whale_vote' || !alert.voter) {
      collapsed.push(alert);
      continue;
    }
    // Keyed on the choice INDEX, not on `participants`: that string embeds the
    // percentage, which differs by a decimal on every clone, so no two clones
    // ever compared equal and the collapse never happened. The index still
    // keeps a whale who voted DIFFERENTLY on two clones as two facts.
    const key = `${alert.voter}|${alert.normalizedTitle}|${alert.choiceKey}`;
    const existing = byIdentity.get(key);
    if (existing) {
      existing.collapsedCount += 1;
      continue;
    }
    byIdentity.set(key, alert);
    collapsed.push(alert);
  }

  const perProposal = new Map<string, number>();
  return collapsed.filter((a) => {
    if (a.type !== 'whale_vote') return true;
    const key = a.normalizedTitle || a.id;
    const seen = perProposal.get(key) ?? 0;
    if (seen >= MAX_WHALE_ALERTS_PER_PROPOSAL) return false;
    perProposal.set(key, seen + 1);
    return true;
  });
}

const SEVERITY_MARKERS: Record<string, string> = {
  critical: '🔴',
  warning: '🟠',
};

/**
 * Pure markdown formatter for the section. Mirrors `formatFallback`'s style
 * (emoji `## ` heading, `- **bold**` bullets) and
 * `formatCuratedNotesSection`'s contract: returns `''` when there is nothing
 * to show, and otherwise leads with `\n\n` so it appends cleanly onto an
 * existing report body.
 */
/**
 * Plain-English name for an alert type, with a count.
 *
 * The report used to write counts as `${n} ${type.replace(/_/g,' ')}`, which
 * printed the enum member — "4 whale vote", singular and lifted straight out of
 * the code. Customers do not read our type names, and a report that shows them
 * reads like a debug dump.
 */
const ALERT_TYPE_NOUN: Record<string, [singular: string, plural: string]> = {
  whale_vote: ['whale vote', 'whale votes'],
  quorum_risk: ['quorum warning', 'quorum warnings'],
  last_minute_swing: ['late swing', 'late swings'],
  coordinated_voting: ['coordinated-voting flag', 'coordinated-voting flags'],
  score_drop: ['Democracy Score drop', 'Democracy Score drops'],
};

export function alertTypeCount(type: string, count: number): string {
  const nouns = ALERT_TYPE_NOUN[type];
  if (!nouns) return `${count} ${type.replace(/_/g, ' ')}`;
  return `${count} ${count === 1 ? nouns[0] : nouns[1]}`;
}

/** Heading for each type's group. Falls back to the raw type for unknown ones. */
const TYPE_HEADINGS: Record<string, string> = {
  whale_vote: 'Whale votes',
  quorum_risk: 'Quorum at risk',
  last_minute_swing: 'Late swings',
  coordinated_voting: 'Coordinated voting',
  score_drop: 'Democracy Score drop',
};

/** The order types appear in. Anything unlisted sorts last, stably. */
const TYPE_ORDER = [
  'quorum_risk',
  'whale_vote',
  'coordinated_voting',
  'last_minute_swing',
  'score_drop',
];

/**
 * Grouped by alert type, with each type's "why it matters" printed ONCE as the
 * group's preamble.
 *
 * It used to be repeated inside every item. `whyItMattersFor` is a pure
 * function of the type, so eight whale alerts meant the same ~70-word
 * paragraph eight times — around a thousand words of the report saying nothing
 * new, and the actual per-alert facts buried between the repeats.
 */
export function formatAttentionAlertsSection(items: AttentionAlert[]): string {
  if (items.length === 0) return '';

  const byType = new Map<string, AttentionAlert[]>();
  for (const item of items) {
    const bucket = byType.get(item.type);
    if (bucket) bucket.push(item);
    else byType.set(item.type, [item]);
  }

  const rank = (type: string) => {
    const i = TYPE_ORDER.indexOf(type);
    return i === -1 ? TYPE_ORDER.length : i;
  };

  const groups = [...byType.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([type, group]) => {
      const heading = TYPE_HEADINGS[type] ?? type.replace(/_/g, ' ');
      // Still-open votes lead their group: those are the ones the reader can
      // still do something about.
      const ordered = [
        ...group.filter((a) => !a.deadlinePassed),
        ...group.filter((a) => a.deadlinePassed),
      ];
      // The preamble is printed once for the whole group, so it can only claim
      // the vote has closed when EVERY item in it has. A mixed group keeps the
      // forward-looking text — correct for its open items — while each closed
      // item still carries its own explicit "Closed:" line.
      const allClosed = ordered.every((a) => a.deadlinePassed);
      const preamble = allClosed
        ? whyItMattersFor(type, true)
        : ordered[0].whyItMatters;
      const lines = [
        `### ${heading}${allClosed ? ' — already closed' : ''} (${ordered.length})`,
        `_${preamble}_`,
        '',
        ...ordered.map(formatAlertItem),
      ];
      return lines.join('\n');
    });

  return `\n\n## 🚨 Alerts requiring attention\n${groups.join('\n\n')}`;
}

function formatAlertItem(a: AttentionAlert): string {
  const marker = SEVERITY_MARKERS[a.severity] ?? '⚪';
  // Several detectors already bake the proposal title into the alert title
  // ("⚡ Vote swing detected on <title>"); don't print it twice. Checked
  // against the raw (pre-escape) title so a title containing an escaped
  // character still matches its own alert heading.
  const showProposal = a.proposalTitle !== null && !a.title.includes(a.proposalTitle);
  const title = escapeMarkdown(a.title);
  const heading = showProposal
    ? `- ${marker} **${title}** — _${escapeMarkdown(a.proposalTitle as string)}_`
    : `- ${marker} **${title}**`;

  const lines = [heading, `  - **What happened:** ${a.whatHappened}`, `  - **Who:** ${a.participants}`];

  if (a.collapsedCount > 0) {
    lines.push(
      `  - **Also on:** ${a.collapsedCount} near-identical clone${a.collapsedCount === 1 ? '' : 's'} of this proposal — same address, same choice.`,
    );
  }
  // Omitted entirely for DAO-level alerts — an empty "Deadline:" line reads
  // like missing data rather than "there is no deadline".
  if (a.deadline) {
    const day = a.deadline.toISOString().slice(0, 10);
    lines.push(
      a.deadlinePassed
        ? `  - **Closed:** ${day} — voting had already ended when this report was generated.`
        : `  - **Deadline:** ${day}`,
    );
  }
  return lines.join('\n');
}

// =============================================
// DB access
// =============================================

/**
 * All actionable alerts for one DAO from the 7 days before `weekOf`, joined
 * to their proposal (left join — `score_drop` has a null `proposalId`) for
 * the deadline, title, state and choice labels.
 *
 * Ordered `critical` first, then most recent first, matching
 * `describeAlerts`.
 */
export async function fetchAttentionAlerts(
  daoId: string,
  weekOf = new Date(),
  limit = ATTENTION_ALERT_LIMIT,
): Promise<AttentionAlertRow[]> {
  const weekAgo = new Date(weekOf.getTime() - 7 * 86400_000);

  const rows = await db
    .select({ alert: alerts, proposal: proposals })
    .from(alerts)
    .leftJoin(proposals, eq(proposals.id, alerts.proposalId))
    .where(
      and(
        eq(alerts.daoId, daoId),
        gt(alerts.createdAt, weekAgo),
        inArray(alerts.severity, [...ACTIONABLE_SEVERITIES]),
      ),
    )
    .orderBy(sql`CASE WHEN ${alerts.severity} = 'critical' THEN 0 ELSE 1 END`, desc(alerts.createdAt))
    .limit(limit);

  return rows.map(({ alert, proposal }) => ({
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    data: alert.data,
    createdAt: alert.createdAt,
    proposalId: alert.proposalId,
    proposalTitle: proposal?.title ?? null,
    proposalChoices: proposal?.choices ?? null,
    proposalState: proposal?.state ?? null,
    proposalEndsAt: proposal?.endTimestamp ?? null,
  }));
}

/**
 * Convenience end-to-end helper for whoever wires the section into the org
 * report body: fetch -> describe -> markdown. Returns `''` for a quiet week.
 */
export async function buildAttentionAlertsSection(
  daoId: string,
  weekOf = new Date(),
): Promise<string> {
  const rows = await fetchAttentionAlerts(daoId, weekOf);
  return formatAttentionAlertsSection(describeAlerts(rows, weekOf));
}
