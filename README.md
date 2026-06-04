# GovWatch

> The public governance watchdog for DAOs. Every proposal explained in plain English. Every whale vote exposed. Every manipulation detected.

## Quick start

```bash
# 1. install
npm install --legacy-peer-deps

# 2. boot Postgres
docker compose up -d

# 3. configure secrets
cp .env.example .env
# fill in OPENROUTER_API_KEY, RESEND_API_KEY, NEXTAUTH_SECRET (any random string), STRIPE_*…

# 4. apply schema + seed DAOs
npm run db:push
npm run db:seed

# 5. first sync (no cron needed for dev)
tsx src/server/jobs/sync-proposals.ts
tsx src/server/jobs/sync-votes.ts
tsx src/server/jobs/generate-summaries.ts
tsx src/server/jobs/compute-scores.ts

# 6. run
npm run dev   # http://localhost:3000
```

## Architecture

- **Frontend & API**: Next.js 15 App Router, tRPC v11, Tailwind, shadcn-style UI primitives.
- **DB**: PostgreSQL via Drizzle ORM. Schema in [src/server/db/schema.ts](src/server/db/schema.ts).
- **Data pipeline**: Snapshot GraphQL hub → upsert into proposals/votes → whale & swing detection → alerts.
- **AI**: OpenRouter with `google/gemini-2.5-flash` (configurable via `OPENROUTER_MODEL`) for proposal summaries and the weekly digest. OpenAI-compatible API — swap models without code changes.
- **Cron**: Vercel Cron (defined in [vercel.json](vercel.json)) hits `/api/cron/*` every 5/10 minutes, daily, and weekly.
- **Auth**: NextAuth v5 magic-link via Resend.
- **Billing**: Stripe Checkout + webhooks → users.plan.
- **Notifications**: Telegram bot + Discord webhook for whale alerts.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run db:generate` | Generate Drizzle migrations from schema |
| `npm run db:push` | Push schema to DB (dev) |
| `npm run db:seed` | Seed the tracked DAO list |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E tests |

## Cron endpoints

| Path | Schedule |
|---|---|
| `/api/cron/sync-proposals` | `*/5 * * * *` |
| `/api/cron/sync-votes` | `*/5 * * * *` |
| `/api/cron/generate-summaries` | `*/10 * * * *` |
| `/api/cron/compute-scores` | `0 2 * * *` (daily 02:00 UTC) |
| `/api/cron/send-digest` | `0 8 * * 1` (Monday 08:00 UTC) |

Protect each with `Authorization: Bearer $CRON_SECRET`.

## Key constants

See [src/lib/constants.ts](src/lib/constants.ts):

- `WHALE_VP_PCT_THRESHOLD = 5` — vote share that flags a whale.
- `LAST_MINUTE_WINDOW_PCT = 0.1` — final 10% of voting window.
- `SCORE_WEIGHTS` — participation 25% · power distribution 25% · proposal diversity 15% · delegate accountability 15% · manipulation resistance 20%.

## License

MIT.
