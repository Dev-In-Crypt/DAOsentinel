import Link from 'next/link';
import { db } from '@/server/db';
import { digests } from '@/server/db/schema';
import { desc } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';

// Dynamic: this no-param page queries the DB per request. ISR would force a
// build-time prerender that hits the database — which fails in CI (no DB).
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Weekly Digest — DAO Sentinel',
  description: 'Archive of weekly governance briefings.',
};

export default async function DigestArchivePage() {
  const rows = await db.select().from(digests).orderBy(desc(digests.weekOf)).limit(52);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Weekly briefing"
        title="Digest"
        highlight="Archive"
        description="Every Monday at 08:00 UTC. Top proposals, whale activity, score movers, upcoming deadlines."
      />

      <div className="grid gap-3">
        {rows.length === 0 && (
          <div className="glass-card py-12 text-center text-sm text-[hsl(var(--text-dim))]">
            No digests yet — the first one ships next Monday.
          </div>
        )}
        {rows.map((d) => (
          <Link key={d.id} href={`/digest/${d.id}`} className="group">
            <div className="glass-card flex items-center justify-between py-4">
              <div>
                <div
                  className="font-semibold"
                  style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                >
                  {d.title}
                </div>
                <div className="text-xs mono text-[hsl(var(--text-dim))]">
                  Week of {new Date(d.weekOf).toLocaleDateString()}
                </div>
              </div>
              <Badge variant={d.sentAt ? 'success' : 'secondary'}>
                {d.sentAt ? 'sent' : 'draft'}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
