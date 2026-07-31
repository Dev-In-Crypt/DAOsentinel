import { describe, expect, it } from 'vitest';
import { and, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { addressLabels } from '@/server/db/schema';

/**
 * The `address_labels` TTL read used to be written as
 * `sql\`${addressLabels.checkedAt} > ${cutoff}\``.
 *
 * A raw interpolation in a `sql` template is an UNTYPED bound parameter —
 * Drizzle has no way to know it belongs to a timestamp column, so the Date
 * object was handed to postgres-js as-is and every read threw
 * `Buffer.byteLength(Date)`. `fetchAddressIdentities` catches cache-read
 * failures on purpose (a cold cache must not fail a paid report), so the
 * throw was swallowed and the cache silently never returned a single row:
 * every report re-resolved every whale address against Snapshot and the
 * public RPCs while logging success.
 *
 * Nothing here touches a database — `postgres()` connects lazily and
 * `.toSQL()` only builds the statement — so this pins the serialisation
 * without needing live infrastructure.
 */

const db = drizzle(postgres('postgresql://unused@127.0.0.1:1/none', { max: 1 }));

const CUTOFF = new Date('2026-07-24T00:00:00.000Z');

// `and(...)` is typed `SQL | undefined`, and `.where()` accepts that directly.
function paramsFor(condition: SQL | undefined): unknown[] {
  return db.select().from(addressLabels).where(condition).toSQL().params;
}

describe('address_labels TTL predicate', () => {
  it('binds the cutoff as a serialised value, never a raw Date', () => {
    const params = paramsFor(
      and(
        eq(addressLabels.daoId, 'dao-1'),
        inArray(addressLabels.address, ['0xabc']),
        gt(addressLabels.checkedAt, CUTOFF),
      ),
    );
    // The exact regression: a Date reaching the driver is what threw.
    expect(params.some((p) => p instanceof Date)).toBe(false);
    expect(params).toContain(CUTOFF.toISOString());
  });

  it('demonstrates the old form did leak a raw Date', () => {
    // Kept as executable evidence of why the typed operator is required — if a
    // future Drizzle release starts serialising raw template values by column,
    // this flips and the comment above can be revisited.
    const params = paramsFor(sql`${addressLabels.checkedAt} > ${CUTOFF}`);
    expect(params.some((p) => p instanceof Date)).toBe(true);
  });
});
