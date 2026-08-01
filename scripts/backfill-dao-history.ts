import 'dotenv/config';
import { basename } from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { db, pgClient } from '../src/server/db';
import { daos, proposals } from '../src/server/db/schema';
import { syncVotesForProposal } from '../src/server/services/snapshot-sync';
import { computeScoreForDao } from '../src/server/services/democracy-score';

/**
 * scripts/backfill-dao-history.ts
 *
 * Pulls a DAO's FULL Snapshot proposal history, which the regular cron cannot.
 *
 * WHY THIS EXISTS: `syncProposals` deliberately skips any closed proposal older
 * than 24 hours (`if (ageSec > 86_400) continue`) to keep each cron tick's
 * payload small. That is correct in steady state and leaves a hole on day one —
 * a DAO added today accumulates only forwards and never learns its own past.
 * Shutter sat at 3 of its 65 proposals for exactly this reason, and Threshold's
 * first sync wrote zero rows out of 50 fetched.
 *
 * The insert below mirrors `syncProposals`' field mapping and conflict target
 * exactly, so a backfilled row is indistinguishable from a synced one and a
 * later cron tick updates it normally.
 *
 * SCOPE: one DAO, named explicitly. Nothing else in the database is read or
 * written.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/backfill-dao-history.ts --slug shutter
 *   npx tsx -r dotenv/config scripts/backfill-dao-history.ts --slug ens --votes 40
 *   npx tsx -r dotenv/config scripts/backfill-dao-history.ts --slug ens --no-votes
 *
 * Notes:
 *   - Plain `tsx` does NOT load `.env` in this repo; pass `-r dotenv/config`.
 *   - Votes are pulled for the N most recent proposals BY DEADLINE, matching
 *     the window `computeScoreForDao` scores over. Default 20.
 *   - The DAO's score row is recomputed at the end, but NO `score_history` row
 *     is written and no alert is raised: a score that moves because our data
 *     got better is not a governance event. Writing the row now also gives the
 *     nightly recompute a correct baseline, so it cannot mistake the backfill
 *     for a real drop.
 */

const HUB = 'https://hub.snapshot.org/graphql';
const PAGE = 100;

export interface ParsedArgs {
  slug: string;
  /** How many recent proposals to pull votes for. 0 means skip votes entirely. */
  voteBackfill: number;
}

export const DEFAULT_VOTE_BACKFILL = 20;

function printUsage(): void {
  console.error(`
Usage:
  npx tsx -r dotenv/config scripts/backfill-dao-history.ts --slug <dao-slug> [--votes N] [--no-votes]

Required:
  --slug     <string>   Slug of a DAO already present in the daos table

Optional:
  --votes    <number>   Pull votes for the N most recent proposals (default ${DEFAULT_VOTE_BACKFILL})
  --no-votes            Backfill proposals only, skip vote pulling
`);
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      bools.add(key);
      continue;
    }
    flags.set(key, value);
    i++;
  }

  const slug = flags.get('slug');
  if (!slug) throw new Error('Missing required flag: --slug');

  if (bools.has('no-votes') && flags.has('votes')) {
    throw new Error('--no-votes and --votes are mutually exclusive — pass exactly one');
  }

  let voteBackfill = DEFAULT_VOTE_BACKFILL;
  if (bools.has('no-votes')) {
    voteBackfill = 0;
  } else if (flags.has('votes')) {
    const n = Number(flags.get('votes'));
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`--votes must be a non-negative integer, got "${flags.get('votes')}"`);
    }
    voteBackfill = n;
  }

  return { slug, voteBackfill };
}

const QUERY = `
  query($space: String!, $first: Int!, $skip: Int!) {
    proposals(first: $first, skip: $skip, where: { space: $space }, orderBy: "created", orderDirection: desc) {
      id title body discussion author choices state type start end snapshot quorum scores scores_total votes
      space { id }
    }
  }`;

interface HubProposal {
  id: string; title: string; body: string | null; discussion: string | null; author: string;
  choices: string[]; state: string; type: string; start: number; end: number;
  snapshot: string | null; quorum: number | null; scores: number[] | null;
  scores_total: number | null; votes: number; space: { id: string };
}

async function fetchPage(space: string, skip: number): Promise<HubProposal[]> {
  const res = await fetch(HUB, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { space, first: PAGE, skip } }),
  });
  if (!res.ok) throw new Error(`Snapshot hub returned ${res.status}`);
  const json = (await res.json()) as { data?: { proposals: HubProposal[] }; errors?: unknown };
  if (json.errors) throw new Error(`Snapshot hub error: ${JSON.stringify(json.errors)}`);
  return json.data?.proposals ?? [];
}

/** Mirrors activate-org.ts — closing the pool before exit avoids a libuv crash on Windows. */
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

  const [dao] = await db.select().from(daos).where(eq(daos.slug, args.slug)).limit(1);
  if (!dao) {
    console.error(`No DAO with slug "${args.slug}". Seed it first (scripts are listed in VERIFY.md).`);
    await exitAfterClosingDb(1);
  }
  if (!dao!.snapshotSpaceId) {
    console.error(`"${args.slug}" has no snapshot_space_id — nothing to backfill from.`);
    await exitAfterClosingDb(1);
  }

  const space = dao!.snapshotSpaceId!;
  const [before] = await db
    .select({ n: proposals.id })
    .from(proposals)
    .where(eq(proposals.daoId, dao!.id))
    .limit(1);
  const countBefore = (await db.select().from(proposals).where(eq(proposals.daoId, dao!.id))).length;
  void before;

  console.log(`Backfilling ${dao!.name} (${args.slug}) from space ${space}`);
  console.log(`  proposals held before: ${countBefore}`);

  let seen = 0;
  let skip = 0;
  try {
    for (;;) {
      const page = await fetchPage(space, skip);
      if (page.length === 0) break;

      for (const p of page) {
        // The hub filters by space already; this guards against a widened query.
        if (p.space.id !== space) continue;
        await db
          .insert(proposals)
          .values({
            daoId: dao!.id,
            externalId: p.id,
            source: 'snapshot',
            title: p.title,
            body: p.body,
            discussion: p.discussion,
            author: p.author,
            choices: p.choices,
            state: p.state,
            votingType: p.type,
            startTimestamp: new Date(p.start * 1000),
            endTimestamp: new Date(p.end * 1000),
            snapshotBlock: p.snapshot,
            quorum: p.quorum != null ? String(p.quorum) : null,
            scores: p.scores ?? [],
            scoresTotal: p.scores_total != null ? String(p.scores_total) : null,
            votesCount: p.votes,
            quorumReached: (p.quorum ?? 0) > 0 ? (p.scores_total ?? 0) >= (p.quorum ?? 0) : false,
          })
          .onConflictDoUpdate({
            target: [proposals.daoId, proposals.externalId, proposals.source],
            set: {
              state: p.state,
              discussion: p.discussion,
              scores: p.scores ?? [],
              scoresTotal: p.scores_total != null ? String(p.scores_total) : null,
              votesCount: p.votes,
              quorumReached: (p.quorum ?? 0) > 0 ? (p.scores_total ?? 0) >= (p.quorum ?? 0) : false,
              updatedAt: new Date(),
            },
          });
        seen += 1;
      }

      skip += page.length;
      console.log(`  …${seen} proposals processed`);
      if (page.length < PAGE) break;
    }
  } catch (err) {
    console.error(`Proposal backfill failed after ${seen} rows: ${(err as Error).message}`);
    await exitAfterClosingDb(1);
  }

  const countAfter = (await db.select().from(proposals).where(eq(proposals.daoId, dao!.id))).length;
  console.log(`  proposals held after:  ${countAfter}  (+${countAfter - countBefore})`);

  if (args.voteBackfill > 0) {
    // Ordered by DEADLINE, matching the window computeScoreForDao scores over.
    // Ordering by createdAt here would be meaningless: every row this script
    // just wrote shares one insert timestamp.
    const recent = await db
      .select({ externalId: proposals.externalId, title: proposals.title })
      .from(proposals)
      .where(eq(proposals.daoId, dao!.id))
      .orderBy(desc(proposals.endTimestamp))
      .limit(args.voteBackfill);

    console.log(`\n  votes for the ${recent.length} most recent proposals:`);
    let votes = 0;
    for (const p of recent) {
      try {
        const n = await syncVotesForProposal(p.externalId);
        votes += n;
        console.log(`    ${String(n).padStart(4)}  ${p.title.slice(0, 60)}`);
      } catch (err) {
        console.warn(`    FAILED  ${p.title.slice(0, 50)} — ${(err as Error).message}`);
      }
    }
    console.log(`    total votes: ${votes}`);
  } else {
    console.log('\n  votes skipped (--no-votes)');
  }

  const previous = Number(dao!.democracyScore ?? 0);
  const score = await computeScoreForDao(dao!.id);
  if (!score) {
    console.log('\n  computeScoreForDao returned null — score row left unchanged');
  } else {
    await db
      .update(daos)
      .set({
        democracyScore: String(score.score),
        scoreBreakdown: score.breakdown as unknown as Record<string, number>,
        totalProposals: score.totalProposals,
        totalVoters: score.totalVoters,
        avgParticipationRate:
          score.avgParticipationRate === null ? null : String(score.avgParticipationRate),
        scoreUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(daos.id, dao!.id));
    console.log(
      `\n  score ${previous.toFixed(2)} -> ${score.score.toFixed(2)}  over ${score.totalProposals} proposals, ${score.totalVoters} voters`,
    );
    console.log(`  turnout: ${score.avgParticipationRate ?? 'unmeasurable'}`);
    console.log(`  breakdown: ${JSON.stringify(score.breakdown)}`);
    console.log(
      '\n  No score_history row was written and no alert raised — a score that moves\n' +
        '  because our data improved is not a governance event, and the row now holds\n' +
        "  the baseline tonight's recompute will compare against.",
    );
  }

  await exitAfterClosingDb(0);
}

// Guard against side effects when the module is imported to unit-test parseArgs.
if (basename(process.argv[1] ?? '') === 'backfill-dao-history.ts') {
  main().catch(async (err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}
