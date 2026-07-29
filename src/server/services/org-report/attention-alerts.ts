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
import { shortenAddress } from '@/lib/utils';

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
  proposalTitle: string | null;
  createdAt: Date;
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
function whyItMattersFor(type: string): string {
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
export function describeAlert(row: AttentionAlertRow): AttentionAlert {
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  const title = typeof row.title === 'string' && row.title.trim() !== '' ? row.title : 'Alert';

  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title,
    whatHappened: description !== '' ? description : title,
    whyItMatters: whyItMattersFor(row.type),
    participants: participantsFor(row),
    // Only proposal-linked alerts carry a deadline; `score_drop` never does.
    deadline: row.proposalId ? row.proposalEndsAt : null,
    proposalTitle: row.proposalId ? row.proposalTitle : null,
    createdAt: row.createdAt,
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

export function describeAlerts(rows: AttentionAlertRow[]): AttentionAlert[] {
  const sorted = rows
    .map(describeAlert)
    .sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        createdAtMs(b.createdAt) - createdAtMs(a.createdAt),
    );

  // Thin whale_vote runs per proposal, keeping the highest-severity/newest
  // ones (the sort above already ordered them). Other types pass through
  // untouched — there is only ever one score_drop or quorum_risk per subject.
  const perProposal = new Map<string, number>();
  return sorted.filter((a) => {
    if (a.type !== 'whale_vote') return true;
    const key = a.proposalTitle ?? a.id;
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
export function formatAttentionAlertsSection(items: AttentionAlert[]): string {
  if (items.length === 0) return '';

  const blocks = items.map((a) => {
    const marker = SEVERITY_MARKERS[a.severity] ?? '⚪';
    // Several detectors already bake the proposal title into the alert title
    // ("⚡ Vote swing detected on <title>"); don't print it twice.
    const showProposal = a.proposalTitle !== null && !a.title.includes(a.proposalTitle);
    const heading = showProposal
      ? `- ${marker} **${a.title}** — _${a.proposalTitle}_`
      : `- ${marker} **${a.title}**`;

    const lines = [
      heading,
      `  - **What happened:** ${a.whatHappened}`,
      `  - **Why it matters:** ${a.whyItMatters}`,
      `  - **Who:** ${a.participants}`,
    ];
    // Omitted entirely for DAO-level alerts — an empty "Deadline:" line reads
    // like missing data rather than "there is no deadline".
    if (a.deadline) lines.push(`  - **Deadline:** ${a.deadline.toISOString().slice(0, 10)}`);
    return lines.join('\n');
  });

  return `\n\n## 🚨 Alerts requiring attention\n${blocks.join('\n')}`;
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
  return formatAttentionAlertsSection(describeAlerts(rows));
}
