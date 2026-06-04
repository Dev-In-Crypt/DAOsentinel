import { execSync } from 'node:child_process';
import postgres from 'postgres';

/**
 * Playwright globalSetup. Skips silently if no DATABASE_URL is set so the
 * suite still runs offline-friendly (e.g. when GitHub Actions hasn't booted
 * a Postgres service). When DB is available:
 *   1. Push schema (drizzle-kit)
 *   2. Seed DAOs
 *   3. Insert fixture proposals, votes, alerts so /daos, /proposals, /alerts
 *      render non-empty in tests.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('[playwright] DATABASE_URL not set — skipping DB fixtures');
    return;
  }

  try {
    execSync('npx drizzle-kit push --force', {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[playwright] drizzle push failed, continuing', err);
  }

  try {
    execSync('npx tsx src/server/db/seed.ts', {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[playwright] seed failed', err);
  }

  const sql = postgres(url, { max: 1 });
  try {
    // Pick first DAO for fixture data
    const [dao] = await sql<{ id: string; slug: string; name: string }[]>`
      SELECT id, slug, name FROM daos LIMIT 1
    `;
    if (!dao) return;

    await sql`
      INSERT INTO proposals (
        dao_id, external_id, source, title, body, author, choices, state,
        voting_type, start_timestamp, end_timestamp, scores, scores_total,
        votes_count, ai_summary, ai_impact, ai_risk_level, summary_generated_at,
        has_whale_vote
      ) VALUES (
        ${dao.id}, 'fixture-1', 'snapshot',
        'Activate new fee tier', 'Original markdown body would go here.', '0xfixture',
        ${sql.json(['For', 'Against', 'Abstain'])}, 'active', 'single-choice',
        now() - interval '2 days', now() + interval '2 days',
        ${sql.json([1200000, 340000, 50000])}, 1590000, 421,
        'This proposal activates a new 0.2% fee tier. Risk: medium.',
        'Liquidity providers benefit. Treasury unaffected.',
        'medium', now(), true
      )
      ON CONFLICT DO NOTHING
    `;

    const [p] = await sql<{ id: string }[]>`
      SELECT id FROM proposals WHERE external_id = 'fixture-1' LIMIT 1
    `;
    if (p) {
      await sql`
        INSERT INTO votes (
          proposal_id, dao_id, voter_address, choice, voting_power,
          voting_power_pct, is_whale, is_last_minute, created_at
        ) VALUES
          (${p.id}, ${dao.id}, '0xabc', 1, 800000, 50.31, true, false, now()),
          (${p.id}, ${dao.id}, '0xdef', 2, 400000, 25.15, true, false, now())
        ON CONFLICT DO NOTHING
      `;

      await sql`
        INSERT INTO alerts (dao_id, proposal_id, type, severity, title, description, data)
        VALUES (
          ${dao.id}, ${p.id}, 'whale_vote', 'critical',
          '🐳 Whale vote on ${sql.unsafe(dao.name)}: 50.3% VP',
          'Address 0xabc cast 800K VP (50.3%) for "Activate new fee tier".',
          ${sql.json({ voter: '0xabc', vpPct: 50.31 })}
        )
        ON CONFLICT DO NOTHING
      `;
    }

    // Compute one Democracy Score so the leaderboard isn't empty
    await sql`
      UPDATE daos
      SET democracy_score = '67.5',
          score_breakdown = ${sql.json({
            participation: 60,
            powerDistribution: 70,
            proposalDiversity: 55,
            delegateAccountability: 80,
            manipulationResistance: 75,
          })},
          score_updated_at = now()
      WHERE id = ${dao.id}
    `;
  } finally {
    await sql.end();
  }
}
