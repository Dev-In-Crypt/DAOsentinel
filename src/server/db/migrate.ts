import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  // No localhost fallback, deliberately. This used to default to
  // `postgresql://postgres:postgres@localhost:5432/govwatch` when DATABASE_URL
  // was unset, which meant a missing env var did not fail — it silently
  // pointed the migration at a DIFFERENT database. On a machine that happens
  // to have a local `govwatch` DB it would have reported success while the
  // real database went untouched. For a schema-mutating script, refusing to
  // run is the only safe answer.
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL is not set. Run via `npm run db:migrate` (which preloads dotenv) ' +
        'or export it explicitly — this script will not guess a database.',
    );
    process.exit(1);
  }

  // Log where we are about to write, host and database only — never the
  // credentials. A migration that reports "Done." should leave no doubt about
  // which database it changed.
  try {
    const parsed = new URL(url);
    console.log(`Target: ${parsed.host}${parsed.pathname}`);
  } catch {
    console.warn('Target: (DATABASE_URL is not a parseable URL)');
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  console.log('Running migrations…');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Done.');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
