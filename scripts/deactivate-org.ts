import 'dotenv/config';
import { basename } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pgClient } from '../src/server/db';
import { organizations } from '../src/server/db/schema';
import { isValidUuid } from '../src/lib/utils';

/**
 * scripts/deactivate-org.ts
 *
 * Companion to activate-org.ts. Billing here is manual end-to-end (see
 * MONETIZATION.md's "manual MVP" runbook) — there is no webhook, no
 * scheduled expiry, and no code anywhere that flips `active` on its own.
 * When a customer's period ends and they don't renew, a human runs this
 * instead of a raw `UPDATE organizations SET active = false` against
 * production.
 *
 * Deliberately just flips `active`, same as activate-org.ts only sets it —
 * it does not delete the row, its members, or any `org_reports` history, so
 * reactivating a returning customer later is `activate-org.ts`'s sibling
 * (re-running it, or a direct `active = true` update) rather than a re-onboard
 * from scratch.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/deactivate-org.ts --org-id <uuid> [--reason "..."]
 *
 * `--reason` is logged to the console only (no `organizations` column exists
 * for it) — for the operator's own paper trail, not stored state.
 */

export interface ParsedArgs {
  orgId: string;
  reason?: string;
}

function printUsage(): void {
  console.error(`
Usage:
  npx tsx -r dotenv/config scripts/deactivate-org.ts --org-id <uuid> [--reason "did not renew"]

Required flags:
  --org-id   <uuid>     Organization id (from activate-org.ts's output, or a DB lookup)

Optional flags:
  --reason   <string>   Logged to the console for your own records — not stored in the DB
`);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) continue;
    flags.set(key, value);
    i++;
  }

  const orgId = flags.get('org-id');
  if (!orgId) {
    throw new Error('Missing required flag: --org-id');
  }
  if (!isValidUuid(orgId)) {
    throw new Error(`--org-id "${orgId}" is not a valid UUID`);
  }

  return { orgId, reason: flags.get('reason') };
}

/** Mirrors activate-org.ts's own connection-teardown pattern. */
async function exitAfterClosingDb(code: number): Promise<never> {
  await pgClient.end({ timeout: 5 });
  process.exit(code);
}

async function main() {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    printUsage();
    process.exit(1);
  }

  try {
    const [existing] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, args.orgId))
      .limit(1);

    if (!existing) {
      console.error(`No organization found with id ${args.orgId}.`);
      await exitAfterClosingDb(1);
    }

    console.log('Deactivating organization:');
    console.log(`  id:      ${existing!.id}`);
    console.log(`  name:    ${existing!.name}`);
    console.log(`  tier:    ${existing!.tier}`);
    console.log(`  daos:    ${existing!.daoSlugs.length > 0 ? existing!.daoSlugs.join(', ') : '(all)'}`);
    console.log(`  active:  ${existing!.active} -> false`);
    if (args.reason) console.log(`  reason:  ${args.reason}`);
    console.log('');

    if (existing!.active === false) {
      console.log('Already inactive — no change made.');
      await exitAfterClosingDb(0);
    }

    const [updated] = await db
      .update(organizations)
      .set({ active: false })
      .where(eq(organizations.id, args.orgId))
      .returning();

    if (!updated) {
      throw new Error('Update returned no row.');
    }

    console.log('Organization deactivated successfully.');
    console.log(
      'Members immediately lose access to the org dashboard, report, and PDF (requireOrgAccess checks `active` on every request) — no other action needed.',
    );
    await exitAfterClosingDb(0);
  } catch (err) {
    console.error('Failed to deactivate organization.');
    console.error('This usually means the database is unreachable — check DATABASE_URL.');
    console.error((err as Error).message ?? err);
    await exitAfterClosingDb(1);
  }
}

// Guard against side effects when this module is imported for unit testing
// `parseArgs` (tests/unit/deactivate-org-args.test.ts) rather than run as a CLI.
if (basename(process.argv[1] ?? '') === 'deactivate-org.ts') {
  main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}
