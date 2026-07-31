import Link from 'next/link';
import { headers } from 'next/headers';
import { db } from '@/server/db';
import { daos } from '@/server/db/schema';
import { desc, asc, ilike, sql, and, inArray } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber, formatUSD } from '@/lib/utils';
import { ORG_BRANDING_HEADER, parseOrgBranding } from '@/lib/org-branding';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'DAO Explorer — DAO Sentinel',
  description: 'All monitored DAOs ranked by Democracy Score.',
};

const PAGE_SIZE = 20;

function buildQuery(extra: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== '' && v !== null) params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default async function DaosPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search ?? '';
  const sort = params.sort ?? 'score';
  const rawPage = Math.max(1, Number(params.page ?? 1) || 1);

  const orderBy =
    sort === 'name'
      ? asc(daos.name)
      : sort === 'proposals'
        ? desc(daos.totalProposals)
        : desc(daos.democracyScore);

  // White-label subdomain DAO scoping (TODO-058): when the request is under
  // an org's branded subdomain (see src/middleware.ts) and that org has a
  // non-empty daoSlugs allowlist, restrict the listing to just those DAOs.
  // `branding` is null on the default/no-org site, so this is a pure no-op
  // there — behavior is unchanged from before this feature existed.
  const headerList = await headers();
  const branding = parseOrgBranding(headerList.get(ORG_BRANDING_HEADER));
  const scopedSlugs = branding && branding.daoSlugs.length > 0 ? branding.daoSlugs : null;

  const filters = [
    search ? ilike(daos.name, `%${search}%`) : undefined,
    scopedSlugs ? inArray(daos.slug, scopedSlugs) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  const whereExpr = filters.length > 0 ? and(...filters) : undefined;

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(daos).where(whereExpr),
    db
      .select()
      .from(daos)
      .where(whereExpr)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((rawPage - 1) * PAGE_SIZE),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(rawPage, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const showingFrom = total === 0 ? 0 : startIndex + 1;
  const showingTo = Math.min(total, startIndex + rows.length);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="The leaderboard"
        title="DAO Governance"
        highlight="Explorer"
        description={
          <>
            <span className="mono text-[hsl(var(--cyan))]">{total}</span> DAOs monitored ·
            sorted by{' '}
            <span className="text-[hsl(var(--indigo-bright))] mono">
              {sort === 'name' ? 'name' : sort === 'proposals' ? 'activity' : 'Democracy Score'}
            </span>
            .
          </>
        }
      />

      <form className="flex flex-wrap gap-3" action="" method="get">
        <Input name="search" defaultValue={search} placeholder="Search DAOs…" className="max-w-md" />
        <select
          name="sort"
          defaultValue={sort}
          className="h-11 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
        >
          <option value="score">Sort: Democracy Score</option>
          <option value="name">Sort: Name</option>
          <option value="proposals">Sort: Activity</option>
        </select>
        {/* Reset to page 1 whenever filters change */}
        <input type="hidden" name="page" value="1" />
      </form>

      <div className="grid gap-3">
        {rows.map((d, i) => {
          const globalIdx = startIndex + i + 1;
          return (
            <Link key={d.id} href={`/daos/${d.slug}`} className="group">
              <div className="glass-card flex items-center gap-5 py-4">
                <span
                  className="w-8 text-2xl font-bold text-[hsl(var(--text-faint))]"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
                >
                  {String(globalIdx).padStart(2, '0')}
                </span>
                <ScoreGauge score={Number(d.democracyScore ?? 0)} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-lg font-semibold"
                      style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                    >
                      {d.name}
                    </span>
                    <Badge variant="outline">{d.chain}</Badge>
                    {d.governanceToken && <Badge variant="secondary">{d.governanceToken}</Badge>}
                  </div>
                  <div className="mt-1 text-xs mono text-[hsl(var(--text-dim))]">
                    {formatNumber(d.totalProposals ?? 0)} proposals ·{' '}
                    {/* Null means we could not measure turnout — no vote data,
                        or too few proposals for the ratio to mean anything.
                        `?? 0` printed "0.00% participation" for 32 of 49 DAOs,
                        which reads as "nobody votes here" about DAOs we simply
                        have no votes for. */}
                    {d.avgParticipationRate == null
                      ? 'turnout not measurable'
                      : `${(Number(d.avgParticipationRate) * 100).toFixed(2)}% turnout (est.)`}
                    {d.treasuryUsd ? ` · ${formatUSD(Number(d.treasuryUsd))} treasury` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-2xl font-bold"
                    style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
                  >
                    {Number(d.democracyScore ?? 0).toFixed(0)}
                    <span style={{ fontSize: 13, color: 'hsl(var(--text-dim))' }}>/100</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
                    Democracy
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
        {!rows.length && (
          <div className="glass-card py-12 text-center text-sm text-[hsl(var(--text-dim))]">
            No DAOs match the current filter.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between gap-3 pt-2"
          aria-label="Pagination"
        >
          <span className="text-xs mono text-[hsl(var(--text-dim))]">
            Showing <span className="text-[hsl(var(--text))]">{showingFrom}</span>–
            <span className="text-[hsl(var(--text))]">{showingTo}</span> of{' '}
            <span className="text-[hsl(var(--text))]">{total}</span>
          </span>
          <div className="flex items-center gap-2 mono text-sm">
            {page > 1 ? (
              <Link
                href={`/daos${buildQuery({ search, sort, page: page - 1 })}`}
                className="rounded-md px-3 py-1.5 text-[hsl(var(--indigo-bright))] shadow-[inset_0_0_0_1px_hsl(var(--line))] hover:bg-[hsl(var(--accent)/0.4)]"
              >
                ← Prev
              </Link>
            ) : (
              <span className="rounded-md px-3 py-1.5 text-[hsl(var(--text-faint))] shadow-[inset_0_0_0_1px_hsl(var(--line))]">
                ← Prev
              </span>
            )}
            <span className="px-2 text-[hsl(var(--text-dim))]">
              Page <span className="text-[hsl(var(--text))]">{page}</span> of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={`/daos${buildQuery({ search, sort, page: page + 1 })}`}
                className="rounded-md px-3 py-1.5 text-[hsl(var(--indigo-bright))] shadow-[inset_0_0_0_1px_hsl(var(--line))] hover:bg-[hsl(var(--accent)/0.4)]"
              >
                Next →
              </Link>
            ) : (
              <span className="rounded-md px-3 py-1.5 text-[hsl(var(--text-faint))] shadow-[inset_0_0_0_1px_hsl(var(--line))]">
                Next →
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
