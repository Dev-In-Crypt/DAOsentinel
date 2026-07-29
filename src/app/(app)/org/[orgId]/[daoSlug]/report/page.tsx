import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { requireOrgAccess } from '@/server/api/org-auth';
import { generateOrgReport } from '@/server/services/org-report';

// Session-gated, org-scoped, and it runs the full report pipeline (including
// one LLM call) — must never be prerendered or cached.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; daoSlug: string }>;
}) {
  const { daoSlug } = await params;
  return { title: `${daoSlug} weekly report — DAO Sentinel` };
}

/**
 * The paid org weekly report, readable in the browser.
 *
 * Until now the report existed only as an email: the sole way to produce one
 * was to curl /api/cron/send-org-digest with the server's CRON_SECRET, which
 * sends to every org member immediately — so nobody could read it before it
 * went out, and a customer could not read it at all. This page closes that
 * gap. It deliberately does NOT send anything; delivery stays on the
 * cron-authenticated path.
 *
 * Auth is the dashboard's gate, replicated exactly (see the CSV route for the
 * same three steps and the reasoning): session -> user -> requireOrgAccess ->
 * explicit orgId cross-check, because requireOrgAccess only proves *some* org
 * of the caller's covers daoSlug, not that it is the org named in the URL.
 */
export default async function OrgReportPage({
  params,
}: {
  params: Promise<{ orgId: string; daoSlug: string }>;
}) {
  const { orgId, daoSlug } = await params;

  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const [user] = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!user) redirect('/login');

  const access = await requireOrgAccess(user.id, daoSlug);
  if (!access.ok) notFound();
  if (access.organization.id !== orgId) notFound();

  const report = await generateOrgReport(orgId, daoSlug);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/org/${orgId}/${daoSlug}`}
          className="inline-flex items-center gap-2 text-sm text-[hsl(var(--indigo-bright))] hover:underline"
        >
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-4">
          <a
            href={`/api/org/${orgId}/${daoSlug}/report.pdf`}
            className="text-sm mono text-[hsl(var(--indigo-bright))] hover:underline"
          >
            Download PDF ↓
          </a>
          <a
            href={`/api/org/${orgId}/${daoSlug}/export.csv`}
            className="text-sm mono text-[hsl(var(--indigo-bright))] hover:underline"
          >
            Export CSV ↓
          </a>
        </div>
      </div>

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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.body}</ReactMarkdown>
          </div>
        </div>
      </article>

      <p className="text-xs text-[hsl(var(--text-dim))]">
        Generated on request from the data as it stands right now — this page does not send
        anything. Delivery to your team&apos;s inboxes is handled separately by your account
        manager.
      </p>
    </div>
  );
}
