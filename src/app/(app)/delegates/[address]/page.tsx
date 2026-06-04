import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/server/db';
import { delegates, delegateDaoActivity, daos } from '@/server/db/schema';
import { eq, desc } from 'drizzle-orm';
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

  const participationPct = (Number(delegate.participationRate ?? 0)) * 100;
  const responseHours = Number(delegate.avgResponseTimeHours ?? 0);

  return (
    <div className="space-y-10">
      <Link
        href="/delegates"
        className="inline-flex items-center gap-2 text-sm text-[hsl(var(--indigo-bright))] hover:underline"
      >
        ← Back to delegate leaderboard
      </Link>

      {/* Hero */}
      <div>
        <span className="eyebrow mb-3">Cross-DAO delegate profile</span>
        <h1
          className="mt-4 text-4xl font-semibold md:text-5xl"
          style={{
            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
            letterSpacing: '-0.025em',
          }}
        >
          {delegate.ensName ? (
            <>
              {delegate.ensName}
              {' '}
              <span className="grad-text">.eth</span>
            </>
          ) : (
            <span className="mono">{shortenAddress(delegate.address)}</span>
          )}
        </h1>
        <p className="mt-3 font-mono text-xs text-[hsl(var(--text-faint))] break-all">
          {delegate.address}
        </p>
      </div>

      {/* Stat cells */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-cell">
          <div className="lab">DAOs active in</div>
          <div className="val">{delegate.totalDaosActive ?? 0}</div>
        </div>
        <div className="stat-cell">
          <div className="lab">Total votes cast</div>
          <div className="val">
            <span className="accent">{formatNumber(delegate.totalVotesCast ?? 0)}</span>
          </div>
        </div>
        <div className="stat-cell">
          <div className="lab">Participation</div>
          <div className="val">
            <span
              className={
                participationPct >= 50 ? 'accent' : participationPct >= 25 ? 'accent-warn' : ''
              }
              style={participationPct < 25 ? { color: 'hsl(var(--rose))' } : undefined}
            >
              {participationPct.toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="stat-cell">
          <div className="lab">Avg response · hours</div>
          <div className="val">
            {responseHours > 0 ? responseHours.toFixed(1) : '—'}
          </div>
        </div>
      </div>

      {/* Activity per DAO */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="app-sec-title">DAO activity</h2>
          <span className="text-xs mono text-[hsl(var(--text-dim))]">
            {activity.length} {activity.length === 1 ? 'DAO' : 'DAOs'}
          </span>
        </div>
        <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
          {activity.length === 0 && (
            <div className="p-10 text-center text-sm text-[hsl(var(--text-dim))]">
              No DAO activity recorded.
            </div>
          )}
          {activity.map(({ activity: a, dao }) => {
            const part = Number(a.participationRate ?? 0) * 100;
            return (
              <Link
                key={a.id}
                href={`/daos/${dao.slug}`}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-[hsl(var(--accent)/0.4)]"
              >
                <div>
                  <div
                    className="font-semibold"
                    style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                  >
                    {dao.name}
                  </div>
                  <div className="text-xs mono text-[hsl(var(--text-dim))]">
                    {a.votesCast} of {a.proposalsAvailable} proposals voted
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm mono font-medium">
                    {formatNumber(Number(a.votingPower ?? 0))} VP
                  </div>
                  <Badge
                    variant={
                      part >= 50 ? 'success' : part >= 25 ? 'warning' : 'destructive'
                    }
                    className="mt-1"
                  >
                    {part.toFixed(0)}% participation
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
