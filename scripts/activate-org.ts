import 'dotenv/config';
import { basename } from 'node:path';
import { db, pgClient } from '../src/server/db';
import { organizations } from '../src/server/db/schema';
import { hexToHsl } from '../src/lib/color';

/**
 * scripts/activate-org.ts
 *
 * TODO-052: Billing MVP — manual, no self-serve checkout.
 * TODO-062: subdomain/branding flags + --all-daos support.
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
 *     [--stripe-subscription-id sub_123] \
 *     [--subdomain acme] \
 *     [--branding-logo-url https://.../acme-logo.png] \
 *     [--branding-primary-color "#4f46e5"] \
 *     [--branding-display-name "Acme Governance"]
 *
 * Or, for a client licensed to see every DAO (no listing restriction):
 *   npx tsx -r dotenv/config scripts/activate-org.ts \
 *     --name "Acme Foundation" --all-daos --tier concierge --email "billing@acme.xyz"
 *
 * Notes:
 *   - Plain `tsx scripts/activate-org.ts` does NOT load `.env` in this repo.
 *     You must run it with `-r dotenv/config` (same quirk as other scripts
 *     in this repo that need DATABASE_URL — see src/server/db/seed.ts).
 *   - `--tier` must be one of: concierge | priority | white_label.
 *   - `--daos` is a comma-separated list of existing DAO slugs (e.g.
 *     "yearn,stargate"). Whitespace around each slug is trimmed. Mutually
 *     exclusive with `--all-daos`.
 *   - `--all-daos` stores an empty `daoSlugs` array — the documented
 *     "no restriction" convention this codebase already uses elsewhere
 *     (see src/app/(app)/daos/page.tsx's scope filter).
 *   - `--branding-primary-color` is validated as a `#rgb`/`#rrggbb` hex color
 *     using the same `hexToHsl` parser the branding pipeline uses at
 *     runtime (src/lib/color.ts) — an invalid value is rejected here, before
 *     it ever reaches the database, rather than silently no-op'ing later.
 *   - The created row is inserted with `active: true` — this script assumes
 *     payment has already cleared before it is run.
 */

const ALLOWED_TIERS = ['concierge', 'priority', 'white_label'] as const;
type Tier = (typeof ALLOWED_TIERS)[number];

export interface ParsedArgs {
  name: string;
  daoSlugs: string[];
  tier: Tier;
  billingContactEmail: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subdomain?: string;
  brandingLogoUrl?: string;
  brandingPrimaryColor?: string;
  brandingDisplayName?: string;
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
    [--stripe-subscription-id sub_123] \\
    [--subdomain acme] \\
    [--branding-logo-url https://.../acme-logo.png] \\
    [--branding-primary-color "#4f46e5"] \\
    [--branding-display-name "Acme Governance"]

Or, for a client licensed to see every DAO:
  npx tsx -r dotenv/config scripts/activate-org.ts \\
    --name "Acme Foundation" --all-daos --tier concierge --email "billing@acme.xyz"

Required flags:
  --name    <string>                 Organization display name
  --tier    concierge|priority|white_label
  --email   <string>                 Billing contact email
  --daos    <slug1,slug2,...>        Comma-separated DAO slugs this org covers
              (required unless --all-daos is passed instead)

Optional flags:
  --all-daos                           No DAO-scope restriction (mutually exclusive with --daos)
  --stripe-customer-id       <string>  Existing Stripe customer id, if known
  --stripe-subscription-id   <string>  Existing Stripe subscription id, if known
  --subdomain                <label>   White-label subdomain (<label>.daosentinel.xyz)
  --branding-logo-url        <url>     Logo URL for white-label branding
  --branding-primary-color   <hex>     #rgb or #rrggbb brand color
  --branding-display-name    <string>  Display name shown on the branded dashboard
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
      // Presence-only flag (e.g. --all-daos) — no value follows.
      boolFlags.add(key);
      continue;
    }
    flags.set(key, value);
    i++;
  }

  const name = flags.get('name');
  const daosRaw = flags.get('daos');
  const allDaos = boolFlags.has('all-daos');
  const tierRaw = flags.get('tier');
  const billingContactEmail = flags.get('email');

  if (allDaos && daosRaw) {
    throw new Error('--all-daos and --daos are mutually exclusive — pass exactly one');
  }

  const missing: string[] = [];
  if (!name) missing.push('--name');
  if (!daosRaw && !allDaos) missing.push('--daos (or --all-daos)');
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

  let daoSlugs: string[];
  if (allDaos) {
    daoSlugs = [];
  } else {
    daoSlugs = daosRaw!
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (daoSlugs.length === 0) {
      throw new Error('--daos must contain at least one non-empty DAO slug (or pass --all-daos)');
    }
  }

  if (!billingContactEmail!.includes('@')) {
    throw new Error(`--email "${billingContactEmail}" does not look like a valid email address`);
  }

  const brandingPrimaryColor = flags.get('branding-primary-color');
  if (brandingPrimaryColor && !hexToHsl(brandingPrimaryColor)) {
    throw new Error(
      `Invalid --branding-primary-color "${brandingPrimaryColor}" — must be a #rgb or #rrggbb hex color`,
    );
  }

  return {
    name: name!,
    daoSlugs,
    tier: tierRaw as Tier,
    billingContactEmail: billingContactEmail!,
    stripeCustomerId: flags.get('stripe-customer-id'),
    stripeSubscriptionId: flags.get('stripe-subscription-id'),
    subdomain: flags.get('subdomain'),
    brandingLogoUrl: flags.get('branding-logo-url'),
    brandingPrimaryColor,
    brandingDisplayName: flags.get('branding-display-name'),
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

  console.log('Activating organization with:');
  console.log(`  name:                    ${args.name}`);
  console.log(
    `  daoSlugs:                ${args.daoSlugs.length > 0 ? args.daoSlugs.join(', ') : '(all — no restriction)'}`,
  );
  console.log(`  tier:                    ${args.tier}`);
  console.log(`  billingContactEmail:     ${args.billingContactEmail}`);
  console.log(`  stripeCustomerId:        ${args.stripeCustomerId ?? '(none)'}`);
  console.log(`  stripeSubscriptionId:    ${args.stripeSubscriptionId ?? '(none)'}`);
  console.log(`  subdomain:               ${args.subdomain ?? '(none)'}`);
  console.log(`  brandingLogoUrl:         ${args.brandingLogoUrl ?? '(none)'}`);
  console.log(`  brandingPrimaryColor:    ${args.brandingPrimaryColor ?? '(none)'}`);
  console.log(`  brandingDisplayName:     ${args.brandingDisplayName ?? '(none)'}`);
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
        subdomain: args.subdomain,
        brandingLogoUrl: args.brandingLogoUrl,
        brandingPrimaryColor: args.brandingPrimaryColor,
        brandingDisplayName: args.brandingDisplayName,
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
    await exitAfterClosingDb(0);
  } catch (err) {
    console.error('Failed to activate organization.');
    console.error(
      'This usually means the database is unreachable (check DATABASE_URL) or the insert violated a constraint (e.g. duplicate subdomain).',
    );
    console.error((err as Error).message ?? err);
    await exitAfterClosingDb(1);
  }
}

// Guard against side effects when this module is imported for unit testing
// `parseArgs` (tests/unit/activate-org-args.test.ts) rather than run as a CLI.
if (basename(process.argv[1] ?? '') === 'activate-org.ts') {
  main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}
