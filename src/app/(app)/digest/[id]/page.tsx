import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db } from '@/server/db';
import { digests } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await db.select().from(digests).where(eq(digests.id, id)).limit(1);
  if (!d) notFound();

  return (
    <div className="space-y-10">
      <Link
        href="/digest"
        className="inline-flex items-center gap-2 text-sm text-[hsl(var(--indigo-bright))] hover:underline"
      >
        ← Back to digest archive
      </Link>

      {/* Hero */}
      <div>
        <span className="eyebrow mb-3">Weekly digest</span>
        <h1
          className="mt-4 text-4xl font-semibold leading-tight md:text-5xl"
          style={{
            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
            letterSpacing: '-0.025em',
          }}
        >
          {d.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[hsl(var(--text-dim))]">
          <span className="mono">
            Week of{' '}
            {new Date(d.weekOf).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
          <Badge variant={d.sentAt ? 'success' : 'secondary'}>
            {d.sentAt ? '✓ delivered' : 'draft'}
          </Badge>
        </div>
      </div>

      {/* Markdown body */}
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{d.body}</ReactMarkdown>
          </div>
        </div>
      </article>

      {/* Footer-CTA */}
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background: 'linear-gradient(165deg, hsl(var(--indigo) / 0.12), hsl(var(--panel) / 0.4))',
          boxShadow: 'inset 0 0 0 1px hsl(var(--indigo) / 0.25)',
        }}
      >
        <h3
          className="text-xl font-semibold"
          style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
        >
          Get the next one in your inbox
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-[hsl(var(--text-dim))]">
          Every Monday at 08:00 UTC. Top proposals, whale activity, score movers.
        </p>
        <Link href="/" className="btn-mc btn-mc-primary mt-5 inline-flex">
          Subscribe →
        </Link>
      </div>
    </div>
  );
}
