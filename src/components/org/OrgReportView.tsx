import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  formatUtcDay,
  formatWeekRange,
  type OrgReportHistoryItem,
} from '@/server/services/org-report/store';

/**
 * Shared chrome for the paid report, used by both the current-week page and
 * the archive page so the two cannot drift apart in styling or in which links
 * they offer.
 */

const RISK_STYLES: Record<string, string> = {
  critical: 'border-[hsl(var(--red))] text-[hsl(var(--red))]',
  elevated: 'border-[hsl(var(--amber))] text-[hsl(var(--amber))]',
  moderate: 'border-[hsl(var(--cyan))] text-[hsl(var(--cyan))]',
  low: 'border-[hsl(var(--green))] text-[hsl(var(--green))]',
};

export function RiskBadge({ level }: { level: string }) {
  const style = RISK_STYLES[level.toLowerCase()] ?? 'border-[hsl(var(--border))] text-[hsl(var(--text-dim))]';
  return (
    <span
      className={`mono rounded border px-2 py-0.5 text-xs uppercase tracking-wide ${style}`}
    >
      {level}
    </span>
  );
}

/**
 * `29 Jul 2026, 09:00 UTC` — assembled from UTC parts rather than via Intl, for
 * the same reason as `formatUtcDay`: the abbreviation Intl picks depends on the
 * runtime's ICU data, and this text is shown to a paying customer.
 */
export function formatInstantUtc(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${formatUtcDay(d)}, ${hh}:${mm} UTC`;
}

export function OrgReportBody({ body }: { body: string }) {
  return (
    <article className="glass-card">
      <div className="mx-auto max-w-3xl">
        <div
          className="prose prose-invert max-w-none
            prose-headings:font-semibold
            prose-h1:text-3xl prose-h1:mb-6 prose-h1:mt-0
            prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:tracking-tight
            prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-[hsl(var(--text))] prose-p:leading-relaxed
            prose-li:text-[hsl(var(--text))]
            prose-strong:text-white
            prose-a:text-[hsl(var(--indigo-bright))] prose-a:no-underline hover:prose-a:underline
            prose-code:text-[hsl(var(--cyan))] prose-code:bg-[hsl(var(--bg-2))] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
            prose-blockquote:border-l-[hsl(var(--indigo))]"
          style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
        </div>
      </div>
    </article>
  );
}

/**
 * Past weeks. Rendered only when there is more than the report already on
 * screen — a one-row "archive" is noise, not history.
 */
export function OrgReportHistory({
  items,
  orgId,
  daoSlug,
  currentId,
}: {
  items: OrgReportHistoryItem[];
  orgId: string;
  daoSlug: string;
  currentId: string;
}) {
  if (items.length < 2) return null;

  return (
    <section className="glass-card">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[hsl(var(--text-dim))]">
        Past reports
      </h2>
      <ul className="divide-y divide-[hsl(var(--border))]">
        {items.map((item) => {
          const isCurrent = item.id === currentId;
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="mono w-44 shrink-0 text-sm text-[hsl(var(--text))]">
                {formatWeekRange(item.weekStart)}
              </span>
              <RiskBadge level={item.riskLevel} />
              <span className="text-xs text-[hsl(var(--text-dim))]">
                {item.sentAt ? `emailed ${formatInstantUtc(item.sentAt)}` : 'not emailed'}
              </span>
              <span className="ml-auto">
                {isCurrent ? (
                  <span className="text-sm text-[hsl(var(--text-dim))]">viewing</span>
                ) : (
                  <Link
                    href={`/org/${orgId}/${daoSlug}/report/${item.id}`}
                    className="text-sm text-[hsl(var(--indigo-bright))] hover:underline"
                  >
                    Open →
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
