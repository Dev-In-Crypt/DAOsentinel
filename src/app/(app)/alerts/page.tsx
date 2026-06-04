import Link from 'next/link';
import { db } from '@/server/db';
import { alerts, daos } from '@/server/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { LiveAlertFeed } from '@/components/alerts/LiveAlertFeed';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  whale_vote: '🐳 Whale vote',
  last_minute_swing: '⚡ Last-minute swing',
  quorum_risk: '⚠ Quorum risk',
  score_drop: '📉 Score drop',
  coordinated_voting: '🤝 Coordinated voting',
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; severity?: string }>;
}) {
  const sp = await searchParams;

  const where = [] as ReturnType<typeof eq>[];
  if (sp.type) where.push(eq(alerts.type, sp.type));
  if (sp.severity) where.push(eq(alerts.severity, sp.severity));

  const rows = await db
    .select({ alert: alerts, dao: daos })
    .from(alerts)
    .innerJoin(daos, eq(daos.id, alerts.daoId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(alerts.createdAt))
    .limit(100);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="The watchtower"
        title="Alert"
        highlight="Feed"
        description="Whales, swings, quorum risks, score drops, coordinated voting — live as it happens."
        right={
          <form className="flex flex-wrap gap-2 text-sm">
            <select
              name="type"
              defaultValue={sp.type ?? ''}
              className="h-10 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
            >
              <option value="">All types</option>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              name="severity"
              defaultValue={sp.severity ?? ''}
              className="h-10 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
            >
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </form>
        }
      />

      <LiveAlertFeed />

      <div>
        <h2 className="app-sec-title">History · last {rows.length}</h2>
        <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
          {rows.length === 0 && (
            <div className="p-10 text-center text-sm text-[hsl(var(--text-dim))]">
              No alerts match the filter.
            </div>
          )}
          {rows.map(({ alert: a, dao }) => (
            <div key={a.id} className="flex items-start gap-3 p-4">
              <Badge
                variant={
                  a.severity === 'critical'
                    ? 'destructive'
                    : a.severity === 'warning'
                      ? 'warning'
                      : 'secondary'
                }
              >
                {a.severity}
              </Badge>
              <div className="flex-1">
                <div
                  className="font-semibold"
                  style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                >
                  {a.title}
                </div>
                <div className="text-sm text-[hsl(var(--text-dim))]">{a.description}</div>
                <div className="mt-1 flex items-center gap-2 text-xs mono text-[hsl(var(--text-faint))]">
                  <Link
                    href={`/daos/${dao.slug}`}
                    className="hover:text-[hsl(var(--indigo-bright))]"
                  >
                    {dao.name}
                  </Link>
                  <span>·</span>
                  <span>{TYPE_LABEL[a.type] ?? a.type}</span>
                  <span>·</span>
                  <span>{timeAgo(a.createdAt)}</span>
                  {a.proposalId && (
                    <>
                      <span>·</span>
                      <Link
                        href={`/proposals/${a.proposalId}`}
                        className="hover:text-[hsl(var(--indigo-bright))]"
                      >
                        view proposal
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
