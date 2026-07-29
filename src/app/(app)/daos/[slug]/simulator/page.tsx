import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { daos } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { PageHeader } from '@/components/layout/PageHeader';
import { SimulatorForm } from './SimulatorForm';

// force-dynamic (not ISR): see src/app/(app)/daos/[slug]/page.tsx for why —
// the root layout's headers() call (TODO-058 branding) conflicts with ISR.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [dao] = await db.select({ name: daos.name }).from(daos).where(eq(daos.slug, slug)).limit(1);
  return {
    title: dao ? `Voting-power simulator — ${dao.name} — DAO Sentinel` : 'Voting-power simulator — DAO Sentinel',
  };
}

export default async function SimulatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [dao] = await db.select().from(daos).where(eq(daos.slug, slug)).limit(1);
  if (!dao) notFound();

  return (
    <div className="space-y-8">
      <Link
        href={`/daos/${dao.slug}`}
        className="inline-flex items-center gap-2 text-sm text-[hsl(var(--indigo-bright))] hover:underline"
      >
        ← Back to {dao.name}
      </Link>

      <PageHeader
        eyebrow="Historical replay · not a prediction"
        title="Voting-power"
        highlight="simulator"
        description={`If you delegated tokens to a wallet, how often would that have swung a vote in ${dao.name} over the past year?`}
      />

      <SimulatorForm daoSlug={dao.slug} />
    </div>
  );
}
