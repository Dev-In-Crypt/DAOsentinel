# GovWatch — Technical Specification & Implementation Plan for AI Coder

## Complete blueprint: from empty repo to production DAO governance watchdog

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                      │
│  Landing │ Explorer │ DAO Profile │ Proposal │ Alerts │ Digest│
└──────────────────────────┬───────────────────────────────────┘
                           │ tRPC + REST
┌──────────────────────────▼───────────────────────────────────┐
│                   BACKEND (Next.js API + Workers)             │
│  tRPC Router │ Auth │ Middleware │ Cron Jobs (Trigger.dev)    │
└──┬──────────┬──────────┬──────────┬──────────┬───────────────┘
   │          │          │          │          │
┌──▼───┐  ┌───▼───┐  ┌───▼───┐  ┌──▼───┐  ┌───▼────┐
│Sync  │  │AI     │  │Alert  │  │Score │  │Digest  │
│Engine│  │Summary│  │Engine │  │Engine│  │Engine  │
└──┬───┘  └───┬───┘  └───┬───┘  └──┬───┘  └───┬────┘
   │          │          │         │           │
┌──▼──────────▼──────────▼─────────▼───────────▼───────────────┐
│                    PostgreSQL (Supabase)                       │
│  daos │ proposals │ votes │ delegates │ alerts │ scores       │
└──────────────────────────┬───────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         Snapshot     Tally Gov     Alchemy
         GraphQL      Contracts      RPC
     (hub.snapshot.   (on-chain     (token
       org/graphql)    votes)      balances)
```

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Fullstack, SSR for SEO, Vercel deploy |
| Language | TypeScript | End-to-end type safety |
| API | tRPC v11 | Type-safe, works natively with Next.js |
| Database | PostgreSQL via Supabase | Managed, free tier, realtime subscriptions |
| ORM | Drizzle ORM | Type-safe, SQL-first, lightweight |
| Cron Jobs | Trigger.dev | Serverless cron, retries, free tier |
| AI/LLM | Anthropic Claude Sonnet 4 | Best quality summaries, cheapest at this volume |
| Charts | Recharts | React-native, dark theme support |
| UI | Tailwind CSS + shadcn/ui | Fast development, consistent dark UI |
| Email | Resend + React Email | Newsletter digest delivery |
| Auth | NextAuth.js v5 | Magic link for premium users |
| Payments | Stripe | Premium subscriptions |
| Deploy | Vercel | Zero-config, edge, preview deploys |
| Notifications | Telegram Bot API + Discord Webhooks | Real-time whale alerts |

## Project Structure

```
govwatch/
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   │   ├── page.tsx                   # Landing page
│   │   │   └── pricing/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx                 # App shell (sidebar + header)
│   │   │   ├── page.tsx                   # Dashboard: trending proposals, recent alerts
│   │   │   ├── daos/
│   │   │   │   ├── page.tsx               # DAO explorer: list + search + sort by score
│   │   │   │   └── [slug]/
│   │   │   │       ├── page.tsx           # DAO profile: score, proposals, delegates
│   │   │   │       ├── proposals/page.tsx # All proposals for this DAO
│   │   │   │       └── delegates/page.tsx # Delegate leaderboard
│   │   │   ├── proposals/
│   │   │   │   └── [id]/page.tsx          # Proposal detail: summary, votes, whale map
│   │   │   ├── alerts/page.tsx            # Alert feed (whale votes, swings, anomalies)
│   │   │   ├── delegates/
│   │   │   │   └── [address]/page.tsx     # Delegate profile across all DAOs
│   │   │   ├── digest/page.tsx            # Weekly digest archive
│   │   │   └── settings/page.tsx          # Premium settings, watchlists, alert config
│   │   ├── api/
│   │   │   ├── trpc/[trpc]/route.ts
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── webhooks/stripe/route.ts
│   │   │   └── cron/                      # Trigger.dev webhook endpoints
│   │   └── layout.tsx
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts                  # Drizzle schema
│   │   │   └── index.ts
│   │   ├── trpc/
│   │   │   ├── router.ts
│   │   │   ├── context.ts
│   │   │   └── routers/
│   │   │       ├── daos.ts
│   │   │       ├── proposals.ts
│   │   │       ├── votes.ts
│   │   │       ├── delegates.ts
│   │   │       ├── alerts.ts
│   │   │       └── scores.ts
│   │   ├── services/
│   │   │   ├── snapshot-sync.ts           # Fetch from Snapshot GraphQL
│   │   │   ├── tally-sync.ts             # Fetch from Tally (on-chain)
│   │   │   ├── ai-summary.ts             # Claude proposal summaries
│   │   │   ├── whale-detector.ts         # Whale vote detection
│   │   │   ├── manipulation-detector.ts  # Advanced manipulation signals
│   │   │   ├── democracy-score.ts        # DAO scoring engine
│   │   │   ├── delegate-tracker.ts       # Delegate performance metrics
│   │   │   ├── digest-generator.ts       # Weekly digest via Claude
│   │   │   └── notifier.ts              # Telegram + Discord + email alerts
│   │   └── jobs/
│   │       ├── sync-proposals.ts         # Every 5 minutes
│   │       ├── sync-votes.ts             # Every 5 minutes
│   │       ├── generate-summaries.ts     # On new proposal
│   │       ├── detect-whales.ts          # On new vote
│   │       ├── compute-scores.ts         # Daily
│   │       └── send-digest.ts            # Weekly (Monday 8:00 UTC)
│   ├── components/
│   │   ├── ui/                            # shadcn/ui
│   │   ├── charts/
│   │   │   ├── VotingPowerChart.tsx
│   │   │   ├── ParticipationChart.tsx
│   │   │   └── ScoreGauge.tsx
│   │   ├── proposals/
│   │   │   ├── ProposalCard.tsx
│   │   │   ├── ProposalSummary.tsx
│   │   │   └── VoteBreakdown.tsx
│   │   ├── alerts/
│   │   │   └── AlertCard.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       └── Header.tsx
│   └── lib/
│       ├── snapshot-client.ts             # GraphQL client for Snapshot
│       ├── constants.ts                   # DAO list, thresholds
│       └── utils.ts
├── drizzle.config.ts
├── trigger.config.ts
├── next.config.js
└── package.json
```

---

## DATABASE SCHEMA

```sql
-- =============================================
-- DAOs
-- =============================================
CREATE TABLE daos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_space_id TEXT UNIQUE,         -- "uniswap" / "aave.eth"
  tally_org_id TEXT,                     -- Tally organization ID (if on-chain)
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  website TEXT,
  chain TEXT,                            -- ethereum | arbitrum | optimism | polygon
  governance_token TEXT,                 -- token symbol
  token_contract TEXT,
  treasury_usd NUMERIC(20,2),

  -- Democracy Score
  democracy_score NUMERIC(5,2) DEFAULT 0,
  score_updated_at TIMESTAMPTZ,
  score_breakdown JSONB,                 -- {participation, power_dist, proposal_diversity, ...}

  -- Metadata
  total_proposals INTEGER DEFAULT 0,
  total_voters INTEGER DEFAULT 0,
  avg_participation_rate NUMERIC(5,4) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- PROPOSALS
-- =============================================
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dao_id UUID NOT NULL REFERENCES daos(id),
  external_id TEXT NOT NULL,             -- Snapshot proposal ID or on-chain ID
  source TEXT NOT NULL,                  -- snapshot | tally | aragon
  
  -- Content
  title TEXT NOT NULL,
  body TEXT,                             -- original markdown body
  author TEXT NOT NULL,                  -- proposer address
  choices JSONB NOT NULL,               -- ["For", "Against", "Abstain"]
  
  -- AI Summary
  ai_summary TEXT,                       -- plain-English 3-5 sentence summary
  ai_impact TEXT,                        -- what changes if this passes
  ai_risk_level TEXT,                    -- low | medium | high
  summary_generated_at TIMESTAMPTZ,

  -- Voting
  state TEXT NOT NULL,                   -- active | closed | pending
  voting_type TEXT,                      -- single-choice | weighted | quadratic | approval
  start_timestamp TIMESTAMPTZ NOT NULL,
  end_timestamp TIMESTAMPTZ NOT NULL,
  snapshot_block TEXT,
  quorum NUMERIC,
  quorum_reached BOOLEAN DEFAULT false,
  
  -- Results
  scores JSONB,                          -- [1234567, 987654, 12345] per choice
  scores_total NUMERIC,
  votes_count INTEGER DEFAULT 0,
  
  -- Flags
  has_whale_vote BOOLEAN DEFAULT false,
  has_last_minute_swing BOOLEAN DEFAULT false,
  is_controversial BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_proposals_external ON proposals(dao_id, external_id, source);
CREATE INDEX idx_proposals_state ON proposals(state, end_timestamp);

-- =============================================
-- VOTES
-- =============================================
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  dao_id UUID NOT NULL REFERENCES daos(id),
  
  voter_address TEXT NOT NULL,
  choice INTEGER NOT NULL,               -- choice index
  voting_power NUMERIC NOT NULL,         -- vp (voting power)
  voting_power_pct NUMERIC(7,4),         -- % of total VP on this proposal
  reason TEXT,                           -- voter's reason (if provided)
  
  -- Whale detection
  is_whale BOOLEAN DEFAULT false,        -- VP > 5% of total
  is_last_minute BOOLEAN DEFAULT false,  -- voted in final 10% of time
  
  created_at TIMESTAMPTZ NOT NULL,       -- when the vote was cast

  UNIQUE(proposal_id, voter_address)
);

CREATE INDEX idx_votes_proposal ON votes(proposal_id);
CREATE INDEX idx_votes_voter ON votes(voter_address);
CREATE INDEX idx_votes_whale ON votes(proposal_id, is_whale) WHERE is_whale = true;

-- =============================================
-- DELEGATES
-- =============================================
CREATE TABLE delegates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  
  -- Profile (aggregated across DAOs)
  name TEXT,                             -- ENS or self-reported
  ens_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  
  -- Performance metrics (recalculated daily)
  total_daos_active INTEGER DEFAULT 0,
  total_votes_cast INTEGER DEFAULT 0,
  participation_rate NUMERIC(5,4),       -- votes cast / proposals available
  avg_response_time_hours NUMERIC(8,2),  -- avg time from proposal open to vote
  consistency_score NUMERIC(5,2),        -- 0-100
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_delegates_address ON delegates(address);

-- Delegate activity per DAO
CREATE TABLE delegate_dao_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegate_id UUID NOT NULL REFERENCES delegates(id),
  dao_id UUID NOT NULL REFERENCES daos(id),
  
  voting_power NUMERIC,
  delegators_count INTEGER,
  votes_cast INTEGER DEFAULT 0,
  proposals_available INTEGER DEFAULT 0,
  participation_rate NUMERIC(5,4),
  
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(delegate_id, dao_id)
);

-- =============================================
-- ALERTS
-- =============================================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dao_id UUID NOT NULL REFERENCES daos(id),
  proposal_id UUID REFERENCES proposals(id),
  
  type TEXT NOT NULL,                    -- whale_vote | last_minute_swing | coordinated_voting | score_drop | quorum_risk
  severity TEXT NOT NULL,                -- info | warning | critical
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Data
  data JSONB,                            -- {voter, vp, vp_pct, choice, ...}
  
  -- Publishing
  published_to_x BOOLEAN DEFAULT false,
  published_to_telegram BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alerts_dao ON alerts(dao_id, created_at DESC);
CREATE INDEX idx_alerts_type ON alerts(type, created_at DESC);

-- =============================================
-- DEMOCRACY SCORE HISTORY
-- =============================================
CREATE TABLE score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dao_id UUID NOT NULL REFERENCES daos(id),
  score NUMERIC(5,2) NOT NULL,
  breakdown JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_score_history ON score_history(dao_id, computed_at DESC);

-- =============================================
-- USERS (premium subscribers)
-- =============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',    -- free | delegate_pro | fund_suite
  stripe_customer_id TEXT,
  
  -- Watchlists
  watched_daos TEXT[],                  -- DAO slugs
  watched_delegates TEXT[],             -- delegate addresses
  
  -- Alert preferences
  alert_email BOOLEAN DEFAULT true,
  alert_telegram BOOLEAN DEFAULT false,
  telegram_chat_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- NEWSLETTER SUBSCRIBERS
-- =============================================
CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  subscribed_at TIMESTAMPTZ DEFAULT now()
);
```

---

## IMPLEMENTATION PLAN — STEP BY STEP

### PHASE 1: FOUNDATION (Steps 1-3)

#### Step 1: Project setup

**Task:** Initialize Next.js 14 project with TypeScript, Tailwind, shadcn/ui, Drizzle, tRPC, Supabase.

**Commands:**
```bash
npx create-next-app@latest govwatch --typescript --tailwind --eslint --app --src-dir
cd govwatch
npm install drizzle-orm postgres @supabase/supabase-js
npm install -D drizzle-kit
npm install @trpc/server @trpc/client @trpc/next @trpc/react-query @tanstack/react-query
npm install next-auth@beta
npm install zod lucide-react recharts
npx shadcn-ui@latest init
npm install graphql-request graphql
```

**Files to create:**
- `docker-compose.yml` — PostgreSQL for local dev
- `drizzle.config.ts`
- `.env.example`
- `src/lib/snapshot-client.ts` — GraphQL client for Snapshot API

**Snapshot GraphQL client:**
```typescript
import { GraphQLClient } from 'graphql-request';

export const snapshotClient = new GraphQLClient(
  'https://hub.snapshot.org/graphql'
);

// No API key needed for basic access
// Rate limit: 120 requests per 20 seconds
```

**Acceptance criteria:**
- `npm run dev` starts without errors
- Snapshot GraphQL client can query proposals
- Database schema applied via Drizzle

**Tests (3):**
- Snapshot client fetches proposals from a known space
- Database migrations run successfully
- Next.js builds without errors

---

#### Step 2: Database schema + seed data

**Task:** Apply full schema, seed with initial list of top 200 DAOs.

**Files to create:**
- `src/server/db/schema.ts` — All tables
- `src/server/db/index.ts` — Connection
- `src/lib/constants.ts` — Initial DAO list

**DAO seed list (example):**
```typescript
export const TRACKED_DAOS = [
  { snapshotSpaceId: 'uniswapgovernance.eth', name: 'Uniswap', slug: 'uniswap', chain: 'ethereum', token: 'UNI' },
  { snapshotSpaceId: 'aave.eth', name: 'Aave', slug: 'aave', chain: 'ethereum', token: 'AAVE' },
  { snapshotSpaceId: 'ens.eth', name: 'ENS', slug: 'ens', chain: 'ethereum', token: 'ENS' },
  { snapshotSpaceId: 'arbitrumfoundation.eth', name: 'Arbitrum', slug: 'arbitrum', chain: 'arbitrum', token: 'ARB' },
  { snapshotSpaceId: 'opcollective.eth', name: 'Optimism', slug: 'optimism', chain: 'optimism', token: 'OP' },
  // ... 195 more
];
```

**Acceptance criteria:**
- All tables created with correct indexes
- 200 DAOs seeded in database
- Seed script is idempotent (re-runnable)

---

#### Step 3: tRPC setup + auth

**Task:** Set up tRPC router with public and protected procedures. NextAuth with magic link for premium users.

**Files to create:**
- `src/server/trpc/context.ts`
- `src/server/trpc/router.ts`
- `src/server/trpc/trpc.ts`
- `src/app/api/trpc/[trpc]/route.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/lib/api.ts` — Client hooks
- `src/app/providers.tsx`

**Key design decision:** Most GovWatch data is public. Auth is only needed for premium features (custom alerts, watchlists, API keys). All read endpoints are public procedures.

**Acceptance criteria:**
- Public procedures accessible without auth
- Protected procedures return 401 without session
- Magic link login works end-to-end

---

### PHASE 2: DATA PIPELINE (Steps 4-6)

#### Step 4: Snapshot proposal & vote sync

**Task:** Build the core data pipeline that fetches proposals and votes from Snapshot GraphQL API.

**Files to create:**
- `src/server/services/snapshot-sync.ts`
- `src/server/jobs/sync-proposals.ts`
- `src/server/jobs/sync-votes.ts`

**Proposal sync (every 5 minutes):**
```typescript
const PROPOSALS_QUERY = `
  query($spaces: [String!], $state: String, $first: Int, $skip: Int) {
    proposals(
      first: $first
      skip: $skip
      where: { space_in: $spaces, state: $state }
      orderBy: "created"
      orderDirection: desc
    ) {
      id title body choices start end snapshot state
      author scores scores_total votes quorum
      space { id name }
      type
    }
  }
`;

async function syncProposals() {
  const daos = await db.query.daos.findMany();
  const spaceIds = daos.map(d => d.snapshotSpaceId).filter(Boolean);
  
  // Fetch active proposals
  const { proposals } = await snapshotClient.request(PROPOSALS_QUERY, {
    spaces: spaceIds,
    state: 'active',
    first: 100,
    skip: 0
  });
  
  // Also fetch recently closed (last 24h) to catch final results
  const { proposals: closedProposals } = await snapshotClient.request(PROPOSALS_QUERY, {
    spaces: spaceIds,
    state: 'closed',
    first: 50,
    skip: 0
  });
  
  for (const proposal of [...proposals, ...closedProposals]) {
    await db.insert(proposals).values({
      daoId: findDaoBySpace(proposal.space.id),
      externalId: proposal.id,
      source: 'snapshot',
      title: proposal.title,
      body: proposal.body,
      author: proposal.author,
      choices: proposal.choices,
      state: proposal.state,
      votingType: proposal.type,
      startTimestamp: new Date(proposal.start * 1000),
      endTimestamp: new Date(proposal.end * 1000),
      snapshotBlock: proposal.snapshot,
      quorum: proposal.quorum,
      scores: proposal.scores,
      scoresTotal: proposal.scores_total,
      votesCount: proposal.votes,
    }).onConflictDoUpdate({
      target: [proposals.daoId, proposals.externalId, proposals.source],
      set: { state: proposal.state, scores: proposal.scores, scoresTotal: proposal.scores_total, votesCount: proposal.votes, updatedAt: new Date() }
    });
  }
}
```

**Vote sync (every 5 minutes, for active proposals):**
```typescript
const VOTES_QUERY = `
  query($proposal: String!, $first: Int, $skip: Int) {
    votes(
      first: $first
      skip: $skip
      where: { proposal: $proposal }
      orderBy: "created"
      orderDirection: desc
    ) {
      id voter vp created choice reason
      proposal { id }
      space { id }
    }
  }
`;

async function syncVotes(proposalExternalId: string) {
  const { votes: newVotes } = await snapshotClient.request(VOTES_QUERY, {
    proposal: proposalExternalId,
    first: 1000,
    skip: 0
  });
  
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.externalId, proposalExternalId)
  });
  
  for (const vote of newVotes) {
    const vpPct = proposal.scoresTotal > 0
      ? (vote.vp / proposal.scoresTotal) * 100
      : 0;
    
    const isWhale = vpPct > 5;
    const totalDuration = proposal.endTimestamp - proposal.startTimestamp;
    const timeFromEnd = proposal.endTimestamp - new Date(vote.created * 1000);
    const isLastMinute = timeFromEnd / totalDuration < 0.1; // final 10%
    
    await db.insert(votes).values({
      proposalId: proposal.id,
      daoId: proposal.daoId,
      voterAddress: vote.voter,
      choice: vote.choice,
      votingPower: vote.vp,
      votingPowerPct: vpPct,
      reason: vote.reason,
      isWhale,
      isLastMinute,
      createdAt: new Date(vote.created * 1000),
    }).onConflictDoNothing();
    
    // Trigger whale detection if needed
    if (isWhale) {
      await whaleDetector.processWhaleVote(proposal, vote, vpPct);
    }
  }
}
```

**Trigger.dev schedule:**
```typescript
export const syncProposalsJob = schedules.task({
  id: "sync-proposals",
  cron: "*/5 * * * *", // every 5 minutes
  run: async () => { await syncProposals(); }
});

export const syncVotesJob = schedules.task({
  id: "sync-votes",
  cron: "*/5 * * * *",
  run: async () => {
    const activeProposals = await db.query.proposals.findMany({
      where: eq(proposals.state, 'active')
    });
    for (const p of activeProposals) {
      await syncVotes(p.externalId);
    }
  }
});
```

**Acceptance criteria:**
- Proposals from top 50 DAOs synced correctly
- Votes synced for all active proposals
- Whale votes flagged (>5% VP)
- Last-minute votes flagged (final 10% of time)
- Upsert logic: no duplicates on re-run
- Rate limiting: stays within 120 req / 20 sec

**Tests (6):**
- Proposal sync fetches and stores active proposals
- Closed proposals update with final scores
- Vote sync stores all votes for a proposal
- Whale flag set correctly when VP > 5%
- Last-minute flag set correctly in final 10% window
- Duplicate sync produces no errors

---

#### Step 5: AI proposal summaries

**Task:** Generate plain-English summaries for every new proposal using Claude API.

**Files to create:**
- `src/server/services/ai-summary.ts`
- `src/server/jobs/generate-summaries.ts`

**System prompt:**
```typescript
export const SUMMARY_SYSTEM_PROMPT = `You are GovWatch AI, a governance analyst that explains DAO proposals to regular people.

Given a DAO proposal, generate:

1. SUMMARY (3-5 sentences): What this proposal does, in plain English. No jargon. A person who knows nothing about this DAO should understand it. Use concrete numbers when available.

2. IMPACT (1-2 sentences): What changes if this passes? Who benefits? Who loses?

3. RISK LEVEL: low | medium | high
   - low: routine parameter changes, small grants, operational decisions
   - medium: significant treasury allocations (>$100K), protocol upgrades, strategy changes
   - high: changes affecting token economics, large treasury movements (>$1M), constitutional amendments, emergency proposals

Rules:
- Never use DAO-specific jargon without explaining it
- Always mention specific dollar amounts if treasury is involved
- If the proposal is about paying someone, say how much and for what
- If you can't determine the impact, say so honestly
- Keep the total output under 200 words
- Do NOT include the labels "SUMMARY:", "IMPACT:", "RISK LEVEL:" in your output — use a natural paragraph structure`;
```

**Implementation:**
```typescript
async function generateSummary(proposal: Proposal): Promise<{summary: string, impact: string, riskLevel: string}> {
  // Skip if already summarized
  if (proposal.aiSummary) return;
  
  // Truncate body to 3000 chars (save tokens, most info is in first 3K)
  const truncatedBody = proposal.body?.slice(0, 3000) || '';
  
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `DAO: ${proposal.daoName}
Title: ${proposal.title}
Choices: ${JSON.stringify(proposal.choices)}
Current votes: ${proposal.votesCount}

Proposal body:
${truncatedBody}`
    }]
  });
  
  const text = response.content[0].text;
  
  // Parse risk level from response (last word should be low/medium/high)
  const riskMatch = text.match(/(low|medium|high)\s*$/i);
  const riskLevel = riskMatch ? riskMatch[1].toLowerCase() : 'medium';
  
  // Split summary and impact (first paragraph = summary, second = impact)
  const paragraphs = text.split('\n\n').filter(p => p.trim());
  const summary = paragraphs[0] || text;
  const impact = paragraphs[1] || '';
  
  await db.update(proposals)
    .set({ aiSummary: summary, aiImpact: impact, aiRiskLevel: riskLevel, summaryGeneratedAt: new Date() })
    .where(eq(proposals.id, proposal.id));
}
```

**Cost estimate:**
- Input: ~500 tokens per proposal (title + truncated body)
- Output: ~150 tokens
- Claude Sonnet cost: ~$0.002 per summary
- 1,000 proposals/month = $2/month

**Acceptance criteria:**
- Every new proposal gets a summary within 10 minutes
- Summaries are 3-5 sentences, plain English, no jargon
- Risk level is always one of: low, medium, high
- Cost per summary < $0.005
- Summaries never fabricate information not in the proposal

**Tests (4):**
- Summary generated for a real Uniswap proposal
- Summary length is 50-200 words
- Risk level is valid enum
- Already-summarized proposals are skipped

---

#### Step 6: Whale detection & alert engine

**Task:** Detect whale votes, last-minute swings, and generate alerts.

**Files to create:**
- `src/server/services/whale-detector.ts`
- `src/server/services/manipulation-detector.ts`
- `src/server/services/notifier.ts`

**Alert types:**

```typescript
type AlertType =
  | 'whale_vote'           // Single address > 5% of total VP
  | 'last_minute_swing'    // Vote outcome flipped in final 10% of time
  | 'quorum_risk'          // Active proposal approaching deadline with <80% quorum
  | 'score_drop'           // DAO Democracy Score dropped > 5 points
  | 'coordinated_voting';  // 3+ addresses with shared funder voted identically

async function processWhaleVote(proposal: Proposal, vote: Vote, vpPct: number) {
  // Create alert
  const alert = await db.insert(alerts).values({
    daoId: proposal.daoId,
    proposalId: proposal.id,
    type: 'whale_vote',
    severity: vpPct > 20 ? 'critical' : vpPct > 10 ? 'warning' : 'info',
    title: `🐳 Whale vote on ${proposal.daoName}: ${vpPct.toFixed(1)}% VP`,
    description: `Address ${shortenAddress(vote.voter)} cast ${formatNumber(vote.vp)} voting power (${vpPct.toFixed(1)}% of total) on "${proposal.title}"`,
    data: { voter: vote.voter, vp: vote.vp, vpPct, choice: vote.choice, proposalTitle: proposal.title }
  });
  
  // Check if this vote caused a swing
  await checkForSwing(proposal);
  
  // Publish alert
  await publishAlert(alert);
}

async function checkForSwing(proposal: Proposal) {
  // Re-fetch current scores
  const currentScores = proposal.scores;
  
  // Get scores from 1 hour ago (approximate from historical votes)
  const previousVotes = await db.query.votes.findMany({
    where: and(
      eq(votes.proposalId, proposal.id),
      lt(votes.createdAt, new Date(Date.now() - 3600000))
    )
  });
  
  // Calculate previous leading choice vs current leading choice
  const previousLeader = findLeadingChoice(previousVotes, proposal.choices);
  const currentLeader = findLeadingChoice(currentScores);
  
  if (previousLeader !== currentLeader) {
    await db.insert(alerts).values({
      daoId: proposal.daoId,
      proposalId: proposal.id,
      type: 'last_minute_swing',
      severity: 'critical',
      title: `⚡ Vote swing on ${proposal.daoName}!`,
      description: `"${proposal.title}" flipped from "${proposal.choices[previousLeader]}" to "${proposal.choices[currentLeader]}" in the final hours`,
      data: { previousLeader, currentLeader, scores: currentScores }
    });
    
    // Flag proposal
    await db.update(proposals)
      .set({ hasLastMinuteSwing: true, isControversial: true })
      .where(eq(proposals.id, proposal.id));
  }
}
```

**Notification delivery:**
```typescript
async function publishAlert(alert: Alert) {
  // 1. Always publish to GovWatch feed (in-app)
  // Already stored in DB
  
  // 2. Publish to X/Twitter (for critical alerts)
  if (alert.severity === 'critical') {
    // Queue for manual or automated X posting
    await notifyQueue.add('post-to-x', { alertId: alert.id });
  }
  
  // 3. Telegram bot (for subscribers)
  const subscribers = await db.query.users.findMany({
    where: and(
      eq(users.alertTelegram, true),
      arrayContains(users.watchedDaos, [alert.daoSlug])
    )
  });
  for (const sub of subscribers) {
    await telegramBot.sendMessage(sub.telegramChatId, formatAlertForTelegram(alert));
  }
  
  // 4. Email (for premium subscribers, batched hourly)
  // Handled by separate digest job
}
```

**Acceptance criteria:**
- Whale votes (>5% VP) generate alerts within 1 minute
- Last-minute swings detected and flagged
- Alerts stored in DB and visible in feed
- Telegram notifications delivered to subscribers
- Alert severity correctly assigned

**Tests (5):**
- Whale vote creates alert with correct data
- Non-whale vote does not create alert
- Vote swing detected when leader changes
- Telegram notification sent to subscriber
- Quorum risk detected at 80% threshold

---

### PHASE 3: SCORING & ANALYTICS (Steps 7-8)

#### Step 7: Democracy Score engine

**Task:** Calculate and update Democracy Score for each DAO daily.

**File:** `src/server/services/democracy-score.ts`

```typescript
function calculateDemocracyScore(dao: DAO, recentProposals: Proposal[], recentVotes: Vote[]): number {
  const weights = {
    participation: 0.25,
    powerDistribution: 0.25,
    proposalDiversity: 0.15,
    delegateAccountability: 0.15,
    manipulationResistance: 0.20,
  };

  // 1. Participation (0-100)
  // Average participation rate across last 20 proposals
  const participationRates = recentProposals.map(p => {
    const totalVoters = p.votesCount;
    const totalHolders = dao.totalVoters || 1;
    return Math.min((totalVoters / totalHolders) * 100, 100);
  });
  const participationScore = average(participationRates) * 5; // scale up (2% = 10 points)
  
  // 2. Power Distribution (0-100)
  // Gini coefficient of voting power (lower Gini = more equal = higher score)
  const vpValues = recentVotes.map(v => v.votingPower);
  const gini = calculateGini(vpValues);
  const powerScore = (1 - gini) * 100;
  
  // 3. Proposal Diversity (0-100)
  // How many unique authors submitted proposals?
  const uniqueAuthors = new Set(recentProposals.map(p => p.author)).size;
  const proposalDiversityScore = Math.min((uniqueAuthors / 10) * 100, 100);
  
  // 4. Delegate Accountability (0-100)
  // Top 20 delegates: what % actually voted?
  const topDelegates = await getTopDelegates(dao.id, 20);
  const activeRate = topDelegates.filter(d => d.participationRate > 0.5).length / 20;
  const delegateScore = activeRate * 100;
  
  // 5. Manipulation Resistance (0-100)
  // % of proposals WITHOUT whale swings or controversial flags
  const cleanProposals = recentProposals.filter(p => !p.hasLastMinuteSwing && !p.hasWhaleVote);
  const manipulationScore = (cleanProposals.length / recentProposals.length) * 100;

  return Math.round(
    participationScore * weights.participation +
    powerScore * weights.powerDistribution +
    proposalDiversityScore * weights.proposalDiversity +
    delegateScore * weights.delegateAccountability +
    manipulationScore * weights.manipulationResistance
  );
}
```

**Acceptance criteria:**
- Score always 0-100
- Score breakdown stored as JSONB
- Historical scores tracked daily
- Score drop > 5 points generates alert

**Tests (5):**
- Perfect DAO scores ~90+
- Dead DAO (0 participation) scores <10
- Whale-dominated DAO scores low on power distribution
- Score is deterministic (same input = same output)
- Score history recorded correctly

---

#### Step 8: Delegate tracker

**Task:** Build delegate performance metrics across all DAOs.

**File:** `src/server/services/delegate-tracker.ts`

**Metrics per delegate:**
- Total DAOs active in
- Participation rate (votes cast / proposals available)
- Average response time (hours from proposal open to vote)
- Consistency score (how predictable is their voting?)
- Cross-DAO profile

**Acceptance criteria:**
- Delegate profiles auto-created from vote data
- ENS names resolved for delegates
- Participation rate correctly calculated
- Top delegates ranked per DAO

**Tests (3):**
- Delegate created from first vote
- Participation rate correct after 10 proposals
- ENS resolution works for known names

---

### PHASE 4: FRONTEND (Steps 9-12)

#### Step 9: DAO Explorer page

**Design:**
```
┌──────────────────────────────────────────────────────────┐
│  GovWatch                                    [Connect]    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  DAO Governance Explorer                                 │
│  [Search DAOs...]  Sort by: [Democracy Score ▾]          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 🏆 Uniswap        Score: 67/100  ███████░░░      │    │
│  │ 234 proposals │ 2.1% participation │ $5.2B treasury│   │
│  │ 3 active proposals │ 1 whale alert today           │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Arbitrum           Score: 54/100  █████░░░░░      │    │
│  │ 189 proposals │ 1.8% participation │ $3.1B treasury│   │
│  │ 5 active proposals │ 2 whale alerts today          │    │
│  └──────────────────────────────────────────────────┘    │
│  ...                                                     │
└──────────────────────────────────────────────────────────┘
```

**Pages to build:**
- `src/app/(app)/daos/page.tsx` — DAO list with search, sort, filter
- `src/app/(app)/daos/[slug]/page.tsx` — DAO profile with score gauge, recent proposals, top delegates

---

#### Step 10: Proposal detail page

**Design:**
```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Uniswap                                      │
│                                                          │
│  Proposal: Activate 1/5 Fee Tier on Uniswap v3          │
│  By: 0xABC...123  │  Ends in 2 days  │  🔴 HIGH RISK    │
│                                                          │
│  ┌─── AI Summary ──────────────────────────────────────┐ │
│  │ This proposal activates a new 0.2% fee tier on      │ │
│  │ Uniswap v3, positioned between the existing 0.05%   │ │
│  │ and 0.3% tiers. If passed, liquidity providers      │ │
│  │ would have a new option for medium-volatility pairs. │ │
│  │ The treasury is not directly affected.               │ │
│  │                                                      │ │
│  │ Impact: Could redistribute $50M+ in liquidity from  │ │
│  │ existing tiers. Benefits LPs on medium-volatility    │ │
│  │ pairs. No direct cost to the protocol.               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  Voting Results                         Quorum: 78% ✓    │
│  ████████████████████░░░░ For: 78%  Against: 22%         │
│  12.4M UNI voted  │  847 voters                          │
│                                                          │
│  🐳 Whale Votes (3)                                      │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 0xDEF...789  │ 2.1M UNI (17%)  │ For  │ 2h ago │    │
│  │ 0xGHI...012  │ 890K UNI (7.2%) │ For  │ 5h ago │    │
│  │ 0xJKL...345  │ 654K UNI (5.3%) │ Against │ 1d ago│   │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  [Read Full Proposal ↗]  [View on Snapshot ↗]            │
└──────────────────────────────────────────────────────────┘
```

---

#### Step 11: Alert feed + Dashboard home

**Dashboard home:** Trending proposals (most votes in last 24h), recent whale alerts, DAOs with score changes, upcoming proposal deadlines.

**Alert feed:** Chronological list of all alerts with filters by type, severity, DAO. Real-time updates via Supabase realtime subscriptions.

---

#### Step 12: Weekly digest generator

**File:** `src/server/services/digest-generator.ts`

```typescript
async function generateWeeklyDigest(): Promise<string> {
  // 1. Collect data
  const topProposals = await getTopProposalsByVotes(7, 10);
  const whaleAlerts = await getAlertsByType('whale_vote', 7);
  const scoreChanges = await getSignificantScoreChanges(7);
  const upcomingDeadlines = await getUpcomingDeadlines(7);
  
  // 2. Generate digest via Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: DIGEST_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Generate the GovWatch Weekly Digest for ${formatDate(new Date())}.

Top proposals this week:
${JSON.stringify(topProposals)}

Whale alerts:
${JSON.stringify(whaleAlerts)}

Democracy Score changes:
${JSON.stringify(scoreChanges)}

Upcoming deadlines:
${JSON.stringify(upcomingDeadlines)}`
    }]
  });
  
  return response.content[0].text;
}
```

**Acceptance criteria:**
- Digest generated every Monday at 8:00 UTC
- Covers top 5-10 proposals, whale activity, score changes
- Sent via Resend to all newsletter subscribers
- Archived on /digest page

---

### PHASE 5: PREMIUM + DEPLOY (Steps 13-15)

#### Step 13: Stripe billing + premium features

**Plans:**

| Plan | Price | Features |
|---|---|---|
| Free | $0 | All data, AI summaries, weekly digest |
| Delegate Pro | $99/mo | Real-time Telegram/Discord alerts, watchlists, API (1K calls) |
| Fund Suite | $399/mo | Portfolio monitoring, delegate comparison, API (10K calls) |

---

#### Step 14: Landing page + SEO

**Landing page sections:**
1. Hero: "Your DAOs are spending billions. Is anyone watching?"
2. Live counter: "X proposals active right now across Y DAOs"
3. Democracy Score leaderboard (top 10 DAOs)
4. Recent whale alerts (social proof of value)
5. AI summary example (before/after: wall of text → 3 sentences)
6. Pricing
7. Newsletter signup CTA

**SEO targets:** "DAO governance analytics", "crypto proposal tracker", "DAO whale voting", "Uniswap governance proposals"

---

#### Step 15: E2E tests + production deploy

**E2E tests (Playwright):**

| # | Test | Flow |
|---|---|---|
| E1 | DAO explorer loads | Navigate to /daos → list renders with scores |
| E2 | Proposal detail shows summary | Click proposal → AI summary visible |
| E3 | Alert feed updates | Whale alert appears in feed |
| E4 | Newsletter signup | Enter email → confirmation |
| E5 | Premium signup | Stripe checkout → plan activated |
| E6 | Mobile responsive | All pages at 375px width |

---

## TEST SUMMARY

| Category | Count |
|---|---|
| Snapshot sync (proposals + votes) | 6 |
| AI summary generation | 4 |
| Whale detection + alerts | 5 |
| Democracy Score | 5 |
| Delegate tracker | 3 |
| tRPC endpoints | 6 |
| Frontend E2E | 6 |
| **Total** | **35** |

---

## IMPLEMENTATION TIMELINE

| Week | Steps | Deliverable |
|---|---|---|
| Week 1 | Steps 1-3 | Foundation: Next.js + DB + tRPC + auth |
| Week 2 | Step 4 | Snapshot sync pipeline: proposals + votes flowing |
| Week 3 | Steps 5-6 | AI summaries + whale detection + alerts |
| Week 4 | Steps 7-8 | Democracy Score + delegate tracker |
| Week 5 | Steps 9-10 | Frontend: DAO explorer + proposal pages |
| Week 6 | Steps 11-12 | Alert feed + weekly digest |
| Week 7 | Steps 13-15 | Premium billing + landing + deploy |

**Total: 7 weeks to production MVP**

---

## FINAL ACCEPTANCE CRITERIA

| # | Criterion | Verification |
|---|---|---|
| 1 | 50+ DAOs synced from Snapshot | DB contains 50+ rows in daos table |
| 2 | Active proposals synced every 5 minutes | Cron job logs show successful runs |
| 3 | Votes synced for all active proposals | votes table growing |
| 4 | AI summaries generated for every new proposal | <1% proposals without summary |
| 5 | Whale votes (>5% VP) flagged | is_whale=true on qualifying votes |
| 6 | Whale alerts created in <1 minute | Alert timestamp within 60s of vote |
| 7 | Last-minute swing detection works | Simulated swing produces alert |
| 8 | Democracy Score computed for all DAOs | All daos have non-null score |
| 9 | Score always 0-100 | No scores outside range |
| 10 | DAO explorer page loads in <2 seconds | Lighthouse check |
| 11 | Proposal page shows AI summary | E2E test |
| 12 | Alert feed displays real-time alerts | E2E test |
| 13 | Weekly digest generated and sent | Email received by test subscriber |
| 14 | Stripe premium subscription works | Test checkout → plan updated |
| 15 | Telegram alerts delivered | Test alert → message received |
| 16 | Mobile responsive (375px) | E2E viewport test |
| 17 | 35+ tests pass in CI | GitHub Actions green |
| 18 | Production URL live | HTTP 200 on homepage |
