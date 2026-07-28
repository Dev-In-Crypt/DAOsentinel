import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/govwatch';

const globalForDb = globalThis as unknown as { _pg?: ReturnType<typeof postgres> };

const client =
  globalForDb._pg ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== 'production') globalForDb._pg = client;

export const db = drizzle(client, { schema });
export { schema };
export type Db = typeof db;

// Exposed so one-shot CLI scripts (scripts/*.ts) can close the connection
// pool before exiting — the long-running app server never calls this, only
// scripts that import `db` and then terminate. Mirrors the pattern already
// used by src/server/db/migrate.ts's own throwaway connection.
export const pgClient = client;
