import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/server/db';
import { delegates, delegateDaoActivity, daos } from '@/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber, shortenAddress } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DelegateProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const addr = address.toLowerCase();
  const [delegate] = await db.select().from(delegates).where(eq(delegates.address, addr)).limit(1);
  if (!delegate) notFound();

  const activity = await db
    .select({ activity: delegateDaoActivity, dao: daos })
    .from(delegateDaoActivity)
    .innerJoin(daos, eq(daos.id, delegateDaoActivity.daoId))
    .where(eq(delegateDaoActivity.delegateId, delegate.id))
    .orderBy(desc(delegateDaoActivity.votingPower));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">
          {delegate.ensName ?? shortenAddress(delegate.address)}
        </h1>
        <p className="font-mono text-xs text-muted-foreground">{delegate.address}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">DAOs active</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{delegate.totalDaosActive ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Votes cast</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">
            {formatNumber(delegate.totalVotesCast ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Participation</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">
            {((Number(delegate.participationRate ?? 0)) * 100).toFixed(0)}%
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>DAO activity</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {activity.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No DAO activity recorded.
            </div>
          )}
          {activity.map(({ activity: a, dao }) => (
            <Link
              key={a.id}
              href={`/daos/${dao.slug}`}
              className="flex items-center justify-between p-4 hover:bg-accent"
            >
              <div>
                <div className="font-medium">{dao.name}</div>
                <div className="text-xs text-muted-foreground">
                  {a.votesCast} of {a.proposalsAvailable} proposals voted
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{formatNumber(Number(a.votingPower ?? 0))} VP</div>
                <Badge variant="outline">
                  {((Number(a.participationRate ?? 0)) * 100).toFixed(0)}%
                </Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
