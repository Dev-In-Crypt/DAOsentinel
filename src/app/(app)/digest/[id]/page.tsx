import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { digests } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await db.select().from(digests).where(eq(digests.id, id)).limit(1);
  if (!d) notFound();

  return (
    <article className="prose prose-invert mx-auto max-w-3xl">
      <Card>
        <CardContent className="py-8">
          <h1>{d.title}</h1>
          <p className="text-sm text-muted-foreground">
            Week of {new Date(d.weekOf).toLocaleDateString()}
          </p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{d.body}</div>
        </CardContent>
      </Card>
    </article>
  );
}
