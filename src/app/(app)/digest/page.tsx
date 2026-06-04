import Link from 'next/link';
import { db } from '@/server/db';
import { digests } from '@/server/db/schema';
import { desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function DigestArchivePage() {
  const rows = await db.select().from(digests).orderBy(desc(digests.weekOf)).limit(52);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Weekly Digest archive</h1>
        <p className="text-muted-foreground">
          Every Monday at 8:00 UTC. Subscribe on the landing page for email delivery.
        </p>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No digests yet — the first one ships next Monday.
            </CardContent>
          </Card>
        )}
        {rows.map((d) => (
          <Link key={d.id} href={`/digest/${d.id}`} className="group">
            <Card className="transition-colors group-hover:border-primary/50">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Week of {new Date(d.weekOf).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant={d.sentAt ? 'success' : 'secondary'}>
                  {d.sentAt ? 'sent' : 'draft'}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
