import 'dotenv/config';
import { db } from './index';
import { daos } from './schema';
import { TRACKED_DAOS } from '../../lib/constants';
import { sql } from 'drizzle-orm';

async function main() {
  console.log(`Seeding ${TRACKED_DAOS.length} DAOs…`);

  for (const dao of TRACKED_DAOS) {
    await db
      .insert(daos)
      .values({
        snapshotSpaceId: dao.snapshotSpaceId,
        tallyOrgId: dao.tallyOrgId,
        name: dao.name,
        slug: dao.slug,
        chain: dao.chain,
        governanceToken: dao.token,
        website: dao.website,
        logoUrl: dao.logoUrl,
      })
      .onConflictDoUpdate({
        target: daos.slug,
        set: {
          name: dao.name,
          chain: dao.chain,
          governanceToken: dao.token,
          website: dao.website,
          tallyOrgId: dao.tallyOrgId,
          updatedAt: sql`now()`,
        },
      });
  }

  console.log('Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
