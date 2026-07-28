import 'dotenv/config';
import { basename } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { db, pgClient } from '../src/server/db';
import { organizations, organizationMembers, users } from '../src/server/db/schema';
import { sendOrgOnboardingEmail } from '../src/server/services/org-onboarding';

/**
 * scripts/add-org-member.ts
 *
 * TODO (sales-readiness pass, item 3): a repeatable way to add a member to
 * an already-activated organization (scripts/activate-org.ts) — separate
 * from activation itself, since real onboarding needs to add people over
 * time (a new team member joins the customer's org months later), not just
 * once at activation.
 *
 * This is an internal admin utility, NOT a customer-facing tool — same
 * category as activate-org.ts. It does NOT create `users` rows: the person
 * must already have a DAO Sentinel account from the public magic-link
 * signup flow at /login before they can be added as an org member.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/add-org-member.ts \
 *     --org-id "11111111-2222-3333-4444-555555555555" \
 *     --email "person@acme.xyz" \
 *     [--role owner] \
 *     [--no-email]
 *
 * Notes:
 *   - Plain `tsx scripts/add-org-member.ts` does NOT load `.env` in this
 *     repo. You must run it with `-r dotenv/config`.
 *   - `--role` defaults to `member` (matches the schema default).
 *   - On success, sends the person the onboarding email (their direct
 *     dashboard link(s)) unless `--no-email` is passed.
 */

const ALLOWED_ROLES = ['owner', 'member'] as const;
type Role = (typeof ALLOWED_ROLES)[number];

export interface ParsedArgs {
  orgId: string;
  email: string;
  role: Role;
  sendEmail: boolean;
}

function printUsage(): void {
  console.error(`
Usage:
  npx tsx -r dotenv/config scripts/add-org-member.ts \\
    --org-id "<organization id>" \\
    --email "person@acme.xyz" \\
    [--role owner] \\
    [--no-email]

Required flags:
  --org-id  <uuid>    Organization id (printed by scripts/activate-org.ts)
  --email   <string>  Email of an EXISTING DAO Sentinel account to add

Optional flags:
  --role      owner|member   Defaults to "member"
  --no-email                 Skip sending the onboarding email
`);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const boolFlags = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      boolFlags.add(key);
      continue;
    }
    flags.set(key, value);
    i++;
  }

  const orgId = flags.get('org-id');
  const email = flags.get('email');
  const roleRaw = flags.get('role') ?? 'member';

  const missing: string[] = [];
  if (!orgId) missing.push('--org-id');
  if (!email) missing.push('--email');
  if (missing.length > 0) {
    throw new Error(`Missing required flag(s): ${missing.join(', ')}`);
  }

  if (!ALLOWED_ROLES.includes(roleRaw as Role)) {
    throw new Error(`Invalid --role "${roleRaw}". Must be one of: ${ALLOWED_ROLES.join(' | ')}`);
  }

  if (!email!.includes('@')) {
    throw new Error(`--email "${email}" does not look like a valid email address`);
  }

  return {
    orgId: orgId!,
    email: email!,
    role: roleRaw as Role,
    sendEmail: !boolFlags.has('no-email'),
  };
}

/**
 * Closes the pooled DB connection before exiting. Without this, an abrupt
 * `process.exit()` while the pool still holds open sockets can crash the
 * process on Windows (libuv assertion `UV_HANDLE_CLOSING`) instead of
 * exiting cleanly — mirrors the pattern already used by
 * src/server/db/migrate.ts's own throwaway connection.
 */
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

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, args.orgId))
    .limit(1);

  if (!org) {
    console.error(`No organization found with id "${args.orgId}".`);
    await exitAfterClosingDb(1);
  }
  if (!org.active) {
    console.error(`Organization "${args.orgId}" exists but is not active — activate it first.`);
    await exitAfterClosingDb(1);
  }

  const [user] = await db.select().from(users).where(eq(users.email, args.email)).limit(1);
  if (!user) {
    console.error(
      `No DAO Sentinel account found for "${args.email}" — the person must sign up via the public magic-link flow at /login first, then re-run this script.`,
    );
    await exitAfterClosingDb(1);
  }

  try {
    const [created] = await db
      .insert(organizationMembers)
      .values({ organizationId: args.orgId, userId: user.id, role: args.role })
      .returning();

    console.log(`Added ${args.email} to "${org.name}" as ${args.role}.`);
    console.log(`  membership id: ${created?.id}`);
  } catch (err) {
    const [existing] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, args.orgId), eq(organizationMembers.userId, user.id)))
      .limit(1);
    if (existing) {
      console.error(`${args.email} is already a member of "${org.name}".`);
      await exitAfterClosingDb(1);
    }
    console.error('Failed to add organization member.');
    console.error((err as Error).message ?? err);
    await exitAfterClosingDb(1);
  }

  if (!args.sendEmail) {
    console.log('Skipping onboarding email (--no-email passed).');
    await exitAfterClosingDb(0);
  }

  const result = await sendOrgOnboardingEmail(args.orgId, args.email);
  if (result.dryRun) {
    console.log(
      `Onboarding email: dry run (RESEND_API_KEY not set) — would have sent to ${args.email}.`,
    );
  } else if (result.sent) {
    console.log(`Onboarding email sent to ${args.email}.`);
  } else {
    console.log(`Onboarding email not sent: ${result.reason ?? 'unknown reason'}.`);
  }
  await exitAfterClosingDb(0);
}

// Guard against side effects when this module is imported for unit testing
// `parseArgs` rather than run as a CLI (see scripts/activate-org.ts for the
// same pattern and the reasoning behind it).
if (basename(process.argv[1] ?? '') === 'add-org-member.ts') {
  main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}
