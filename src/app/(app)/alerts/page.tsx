import Link from 'next/link';
import { db } from '@/server/db';
import { alerts, daos } from '@/server/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { timeAgo } from '@/lib/utils';
import { LiveAlertFeed } from '@/components/alerts/LiveAlertFeed';

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Alert feed</h1>
        <p className="text-muted-foreground">
          Whales, swings, quorum risks, score drops, coordinated voting.
        </p>
      </div>

      <LiveAlertFeed />

      <form className="flex flex-wrap gap-2 text-sm">
        <select name="type" defaultValue={sp.type ?? ''} className="h-9 rounded-md border bg-background px-2">
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
          className="h-9 rounded-md border bg-background px-2"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </form>

      <Card>
        <CardContent className="divide-y p-0">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">No alerts match.</div>
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
                <div className="font-medium">{a.title}</div>
                <div className="text-sm text-muted-foreground">{a.description}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Link href={`/daos/${dao.slug}`} className="hover:underline">
                    {dao.name}
                  </Link>
                  <span>·</span>
                  <span>{TYPE_LABEL[a.type] ?? a.type}</span>
                  <span>·</span>
                  <span>{timeAgo(a.createdAt)}</span>
                  {a.proposalId && (
                    <>
                      <span>·</span>
                      <Link href={`/proposals/${a.proposalId}`} className="hover:underline">
                        view proposal
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
