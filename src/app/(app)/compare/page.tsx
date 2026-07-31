import Link from 'next/link';
import { db } from '@/server/db';
import { daos, proposals } from '@/server/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { ProgressBar } from '@/components/ui/progress';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber, formatUSD, formatPct, timeAgo } from '@/lib/utils';
import { METRIC_HINT } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Compare DAOs — DAO Sentinel',
  description: 'Side-by-side Democracy Score comparison.',
};

const METRIC_LABEL: Record<string, string> = {
  participation: 'Voter participation',
  powerDistribution: 'Power distribution',
  proposalDiversity: 'Proposal diversity',
  delegateAccountability: 'Delegate accountability',
  manipulationResistance: 'Manipulation resistance',
};

async function loadDao(slug: string) {
  const [d] = await db.select().from(daos).where(eq(daos.slug, slug)).limit(1);
  if (!d) return null;
  const recent = await db
    .select({ id: proposals.id, title: proposals.title, state: proposals.state, endTimestamp: proposals.endTimestamp })
    .from(proposals)
    .where(eq(proposals.daoId, d.id))
    .orderBy(desc(proposals.createdAt))
    .limit(3);
  return { dao: d, recent };
}

function tone(better: boolean) {
  return better ? 'hsl(var(--mint))' : 'hsl(var(--rose))';
}

function StatRow({
  label,
  aValue,
  bValue,
  format = (v: number | null) => (v == null ? '—' : String(v)),
  higherIsBetter = true,
}: {
  label: string;
  aValue: number | null;
  bValue: number | null;
  format?: (v: number | null) => string;
  higherIsBetter?: boolean;
}) {
  let aTone: string | undefined;
  let bTone: string | undefined;
  if (aValue != null && bValue != null && aValue !== bValue) {
    const aBetter = higherIsBetter ? aValue > bValue : aValue < bValue;
    aTone = aBetter ? tone(true) : tone(false);
    bTone = aBetter ? tone(false) : tone(true);
  }
  return (
    <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-4 border-b py-4 last:border-b-0" style={{ borderColor: 'hsl(var(--line))' }}>
      <div
        className="mono text-right text-xl font-semibold"
        style={{ color: aTone, fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
      >
        {format(aValue)}
      </div>
      <div className="text-center text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
        {label}
      </div>
      <div
        className="mono text-left text-xl font-semibold"
        style={{ color: bTone, fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
      >
        {format(bValue)}
      </div>
    </div>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const sp = await searchParams;
  const slugA = sp.a?.toLowerCase() ?? null;
  const slugB = sp.b?.toLowerCase() ?? null;

  // Picker mode when either slug is missing or invalid
  if (!slugA || !slugB) {
    const allDaos = await db
      .select({ slug: daos.slug, name: daos.name })
      .from(daos)
      .orderBy(asc(daos.name));
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Side by side"
          title="Compare"
          highlight="DAOs"
          description="Pick two DAOs to see their Democracy Score, treasury, participation and recent activity side by side."
        />
        <form action="/compare" method="get" className="glass-card flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">DAO A</span>
            <select
              name="a"
              defaultValue={slugA ?? ''}
              required
              className="h-11 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
            >
              <option value="">Pick DAO A…</option>
              {allDaos.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">DAO B</span>
            <select
              name="b"
              defaultValue={slugB ?? ''}
              required
              className="h-11 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
            >
              <option value="">Pick DAO B…</option>
              {allDaos.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-mc btn-mc-primary" style={{ height: 44 }}>
            Compare →
          </button>
        </form>
      </div>
    );
  }

  const [a, b] = await Promise.all([loadDao(slugA), loadDao(slugB)]);
  if (!a || !b) {
    return (
      <div className="glass-card py-12 text-center text-sm text-[hsl(var(--text-dim))]">
        One of the DAOs was not found.{' '}
        <Link href="/compare" className="text-[hsl(var(--indigo-bright))] hover:underline">
          Pick again →
        </Link>
      </div>
    );
  }

  const bdA = (a.dao.scoreBreakdown ?? {}) as Record<string, number>;
  const bdB = (b.dao.scoreBreakdown ?? {}) as Record<string, number>;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Side by side"
        title="Compare"
        highlight="DAOs"
        description={
          <>
            <span className="mono text-[hsl(var(--cyan))]">{a.dao.name}</span> vs{' '}
            <span className="mono text-[hsl(var(--cyan))]">{b.dao.name}</span>
          </>
        }
        right={
          <Link href="/compare" className="text-sm text-[hsl(var(--indigo-bright))] hover:underline mono">
            Change DAOs →
          </Link>
        }
      />

      {/* Hero — two gauges side by side */}
      <div className="grid grid-cols-2 gap-6">
        {[a, b].map(({ dao }, i) => (
          <div
            className={`flex flex-col items-center gap-3 glass-card py-6 text-center sm:flex-row sm:gap-5 sm:text-left ${
              i === 1 ? 'sm:flex-row-reverse sm:text-right' : ''
            }`}
            key={dao.id}
          >
            <ScoreGauge score={Number(dao.democracyScore ?? 0)} size="lg" />
            <div>
              <Link href={`/daos/${dao.slug}`} className="text-xl font-bold hover:underline sm:text-2xl" style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
                {dao.name}
              </Link>
              <div
                className={`mt-2 flex flex-wrap items-center justify-center gap-2 ${
                  i === 1 ? 'sm:justify-end' : 'sm:justify-start'
                }`}
              >
                <Badge variant="outline">{dao.chain}</Badge>
                {dao.governanceToken && <Badge variant="secondary">{dao.governanceToken}</Badge>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <section>
        <h2 className="app-sec-title">Headline metrics</h2>
        <div className="glass-card py-0">
          <StatRow
            label="Democracy Score"
            aValue={Number(a.dao.democracyScore ?? 0)}
            bValue={Number(b.dao.democracyScore ?? 0)}
            format={(v) => (v == null ? '—' : `${v.toFixed(1)}`)}
          />
          <StatRow
            label="Treasury USD"
            aValue={a.dao.treasuryUsd ? Number(a.dao.treasuryUsd) : null}
            bValue={b.dao.treasuryUsd ? Number(b.dao.treasuryUsd) : null}
            format={(v) => formatUSD(v)}
          />
          <StatRow
            label="Total proposals"
            aValue={a.dao.totalProposals ?? 0}
            bValue={b.dao.totalProposals ?? 0}
            format={(v) => (v == null ? '—' : formatNumber(v))}
          />
          {/* Null stays null — the other rows here already render "—" for
              missing data, and turning an unmeasurable turnout into 0% would
              make one DAO look worse than the other on evidence we do not
              have. */}
          <StatRow
            label="Est. turnout (proxy)"
            aValue={
              a.dao.avgParticipationRate == null ? null : Number(a.dao.avgParticipationRate) * 100
            }
            bValue={
              b.dao.avgParticipationRate == null ? null : Number(b.dao.avgParticipationRate) * 100
            }
            format={(v) => (v == null ? '—' : formatPct(v))}
          />
          <StatRow
            label="Token price"
            aValue={a.dao.tokenPriceUsd ? Number(a.dao.tokenPriceUsd) : null}
            bValue={b.dao.tokenPriceUsd ? Number(b.dao.tokenPriceUsd) : null}
            format={(v) => (v == null ? '—' : `$${v >= 100 ? v.toFixed(0) : v.toFixed(2)}`)}
          />
        </div>
      </section>

      {/* Breakdown side-by-side */}
      {(Object.keys(bdA).length > 0 || Object.keys(bdB).length > 0) && (
        <section>
          <h2 className="app-sec-title">Score breakdown</h2>
          <div className="glass-card space-y-4">
            {Object.keys(METRIC_LABEL).map((k) => (
              <div
                key={k}
                className="grid grid-cols-[1fr_120px_1fr] items-center gap-4"
                title={METRIC_HINT[k]}
              >
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-xs mono">
                    <span className="text-[hsl(var(--text-faint))]">{METRIC_LABEL[k]}</span>
                    <span>{(bdA[k] ?? 0).toFixed(0)}</span>
                  </div>
                  <ProgressBar value={bdA[k] ?? 0} />
                </div>
                <div className="text-center text-[10px] uppercase tracking-wider mono text-[hsl(var(--text-faint))]">vs</div>
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-xs mono">
                    <span>{(bdB[k] ?? 0).toFixed(0)}</span>
                    <span className="text-[hsl(var(--text-faint))]">{METRIC_LABEL[k]}</span>
                  </div>
                  <ProgressBar value={bdB[k] ?? 0} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section>
        <h2 className="app-sec-title">Recent activity</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[a, b].map(({ dao, recent }) => (
            <div key={dao.id} className="glass-card divide-y divide-[hsl(var(--line))] p-0">
              <div className="px-4 py-3 text-xs uppercase tracking-wider mono text-[hsl(var(--text-dim))]">
                {dao.name}
              </div>
              {recent.length === 0 && (
                <div className="p-6 text-center text-sm text-[hsl(var(--text-dim))]">No recent proposals.</div>
              )}
              {recent.map((p) => (
                <Link key={p.id} href={`/proposals/${p.id}`} className="block p-4 hover:bg-[hsl(var(--accent)/0.4)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="line-clamp-1 text-sm font-medium">{p.title}</div>
                    <Badge variant={p.state === 'active' ? 'success' : 'secondary'}>{p.state}</Badge>
                  </div>
                  <div className="mt-1 text-xs mono text-[hsl(var(--text-dim))]">
                    {timeAgo(p.endTimestamp)}
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
