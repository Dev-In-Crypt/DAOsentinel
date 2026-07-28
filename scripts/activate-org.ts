import 'dotenv/config';
import { db } from '../src/server/db';
import { organizations } from '../src/server/db/schema';

/**
 * scripts/activate-org.ts
 *
 * TODO-052: Billing MVP — manual, no self-serve checkout.
 *
 * This is an internal admin utility, NOT a customer-facing tool. It is only
 * ever run by a human, by hand, AFTER that human has already confirmed
 * payment out-of-band (Stripe Payment Link or manual invoice created
 * directly in the Stripe Dashboard). There is no checkout flow, webhook, or
 * automated billing anywhere in this codebase — see MONETIZATION.md (local,
 * gitignored) for the full runbook.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/activate-org.ts \
 *     --name "Acme Foundation" \
 *     --daos "acme,acme-grants" \
 *     --tier concierge \
 *     --email "billing@acme.xyz" \
 *     [--stripe-customer-id cus_123] \
 *     [--stripe-subscription-id sub_123]
 *
 * Notes:
 *   - Plain `tsx scripts/activate-org.ts` does NOT load `.env` in this repo.
 *     You must run it with `-r dotenv/config` (same quirk as other scripts
 *     in this repo that need DATABASE_URL — see src/server/db/seed.ts).
 *   - `--tier` must be one of: concierge | priority | white_label.
 *   - `--daos` is a comma-separated list of existing DAO slugs (e.g.
 *     "yearn,stargate"). Whitespace around each slug is trimmed.
 *   - The created row is inserted with `active: true` — this script assumes
 *     payment has already cleared before it is run.
 */

const ALLOWED_TIERS = ['concierge', 'priority', 'white_label'] as const;
type Tier = (typeof ALLOWED_TIERS)[number];

interface ParsedArgs {
  name: string;
  daoSlugs: string[];
  tier: Tier;
  billingContactEmail: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

function printUsage(): void {
  console.error(`
Usage:
  npx tsx -r dotenv/config scripts/activate-org.ts \\
    --name "Acme Foundation" \\
    --daos "acme,acme-grants" \\
    --tier concierge \\
    --email "billing@acme.xyz" \\
    [--stripe-customer-id cus_123] \\
    [--stripe-subscription-id sub_123]

Required flags:
  --name    <string>                 Organization display name
  --daos    <slug1,slug2,...>        Comma-separated DAO slugs this org covers
  --tier    concierge|priority|white_label
  --email   <string>                 Billing contact email

Optional flags:
  --stripe-customer-id       <string>  Existing Stripe customer id, if known
  --stripe-subscription-id   <string>  Existing Stripe subscription id, if known
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    flags.set(key, value);
    i++;
  }

  const name = flags.get('name');
  const daosRaw = flags.get('daos');
  const tierRaw = flags.get('tier');
  const billingContactEmail = flags.get('email');

  const missing: string[] = [];
  if (!name) missing.push('--name');
  if (!daosRaw) missing.push('--daos');
  if (!tierRaw) missing.push('--tier');
  if (!billingContactEmail) missing.push('--email');

  if (missing.length > 0) {
    throw new Error(`Missing required flag(s): ${missing.join(', ')}`);
  }

  if (!ALLOWED_TIERS.includes(tierRaw as Tier)) {
    throw new Error(
      `Invalid --tier "${tierRaw}". Must be one of: ${ALLOWED_TIERS.join(' | ')}`,
    );
  }

  const daoSlugs = daosRaw!
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (daoSlugs.length === 0) {
    throw new Error('--daos must contain at least one non-empty DAO slug');
  }

  if (!billingContactEmail!.includes('@')) {
    throw new Error(`--email "${billingContactEmail}" does not look like a valid email address`);
  }

  return {
    name: name!,
    daoSlugs,
    tier: tierRaw as Tier,
    billingContactEmail: billingContactEmail!,
    stripeCustomerId: flags.get('stripe-customer-id'),
    stripeSubscriptionId: flags.get('stripe-subscription-id'),
  };
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

  console.log('Activating organization with:');
  console.log(`  name:                    ${args.name}`);
  console.log(`  daoSlugs:                ${args.daoSlugs.join(', ')}`);
  console.log(`  tier:                    ${args.tier}`);
  console.log(`  billingContactEmail:     ${args.billingContactEmail}`);
  console.log(`  stripeCustomerId:        ${args.stripeCustomerId ?? '(none)'}`);
  console.log(`  stripeSubscriptionId:    ${args.stripeSubscriptionId ?? '(none)'}`);
  console.log('');

  try {
    const [created] = await db
      .insert(organizations)
      .values({
        name: args.name,
        daoSlugs: args.daoSlugs,
        tier: args.tier,
        billingContactEmail: args.billingContactEmail,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        active: true,
      })
      .returning();

    if (!created) {
      throw new Error('Insert returned no row.');
    }

    console.log(`Organization activated successfully.`);
    console.log(`  id:     ${created.id}`);
    console.log(`  active: ${created.active}`);
    console.log('');
    console.log(
      `Reminder (per MONETIZATION.md runbook): confirm the row looks right, then send the customer their access details manually.`,
    );
    process.exit(0);
  } catch (err) {
    console.error('Failed to activate organization.');
    console.error(
      'This usually means the database is unreachable (check DATABASE_URL) or the insert violated a constraint (e.g. duplicate subdomain).',
    );
    console.error((err as Error).message ?? err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
