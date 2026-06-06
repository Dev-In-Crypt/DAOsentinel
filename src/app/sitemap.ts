import type { MetadataRoute } from 'next';
import { desc } from 'drizzle-orm';
import { db } from '@/server/db';
import { daos, proposals, digests } from '@/server/db/schema';

const BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

export const revalidate = 3600; // regenerate the sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages with their relative priority for search engines.
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE}/daos`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/proposals`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE}/alerts`, lastModified: now, changeFrequency: 'hourly', priority: 0.85 },
    { url: `${BASE}/delegates`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/digest`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/docs`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/api-docs`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/roadmap`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/compare`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/delegates/blocs`, lastModified: now, changeFrequency: 'daily', priority: 0.65 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  try {
    const [allDaos, recentProposals, allDigests] = await Promise.all([
      db
        .select({ slug: daos.slug, updatedAt: daos.updatedAt })
        .from(daos),
      db
        .select({ id: proposals.id, updatedAt: proposals.updatedAt })
        .from(proposals)
        .orderBy(desc(proposals.createdAt))
        .limit(500),
      db.select({ id: digests.id, weekOf: digests.weekOf }).from(digests),
    ]);

    return [
      ...staticPages,
      ...allDaos.map((d) => ({
        url: `${BASE}/daos/${d.slug}`,
        lastModified: d.updatedAt ?? now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      })),
      ...recentProposals.map((p) => ({
        url: `${BASE}/proposals/${p.id}`,
        lastModified: p.updatedAt ?? now,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      })),
      ...allDigests.map((d) => ({
        url: `${BASE}/digest/${d.id}`,
        lastModified: d.weekOf ?? now,
        changeFrequency: 'never' as const,
        priority: 0.5,
      })),
    ];
  } catch (err) {
    // If the DB is unreachable at build/serve time, at least ship the static pages.
    console.warn('[sitemap] db fetch failed, falling back to static pages only', err);
    return staticPages;
  }
}
