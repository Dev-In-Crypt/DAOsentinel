import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata = {
  title: 'Roadmap — DAO Sentinel',
  description: 'What we shipped, what we are building, and where DAO Sentinel is heading.',
};

type Status = 'shipped' | 'live' | 'building' | 'next' | 'idea';

interface Item {
  status: Status;
  title: string;
  body: string;
}

interface Phase {
  q: string;
  title: string;
  highlight?: string;
  items: Item[];
}

const STATUS_LABEL: Record<Status, string> = {
  shipped: '✓ Shipped',
  live: '● Live',
  building: '◐ Building',
  next: '○ Next up',
  idea: '◌ Idea',
};

const STATUS_COLOR: Record<Status, string> = {
  shipped: 'hsl(var(--mint))',
  live: 'hsl(var(--cyan))',
  building: 'hsl(var(--amber))',
  next: 'hsl(var(--indigo-bright))',
  idea: 'hsl(var(--text-faint))',
};

const PHASES: Phase[] = [
  {
    q: 'Phase 01',
    title: 'Foundation',
    highlight: '· shipped',
    items: [
      {
        status: 'shipped',
        title: 'Snapshot data pipeline',
        body: 'Proposals and votes for the top 50 DAOs ingested every 5 minutes via Snapshot GraphQL hub, with full vote history indexed per proposal.',
      },
      {
        status: 'shipped',
        title: 'Democracy Score (0-100)',
        body: 'Gini-based power distribution + 4 more axes (turnout, proposal diversity, delegate accountability, manipulation resistance). Recomputed daily, history archived.',
      },
      {
        status: 'shipped',
        title: 'AI plain-English summaries',
        body: 'Gemini 2.5 Flash via OpenRouter explains every proposal in 3-5 sentences with impact + risk level. Cost ~$0.0001 per proposal.',
      },
      {
        status: 'shipped',
        title: 'Whale & swing detection',
        body: 'Real-time alerts for >5% VP single-wallet votes, last-minute swings, quorum risks, and coordinated voting patterns.',
      },
      {
        status: 'shipped',
        title: 'Cross-DAO delegate tracker',
        body: 'Cross-DAO delegate profiles with participation, ENS resolution, Karma reputation, and response-time metrics.',
      },
      {
        status: 'shipped',
        title: 'Live SSE alert feed',
        body: 'Postgres LISTEN/NOTIFY → Server-Sent Events → browser. Whale alerts ping the orbital hero feed within a second of detection.',
      },
    ],
  },
  {
    q: 'Phase 02',
    title: 'Distribution',
    highlight: '· now',
    items: [
      {
        status: 'live',
        title: 'Magic-link login (Resend)',
        body: 'Passwordless email sign-in. Verified domain, SPF/DKIM/DMARC live.',
      },
      {
        status: 'live',
        title: 'Embeddable Democracy Score badge',
        body: 'Shields.io-style SVG at /api/badge/<dao>. DAO maintainers can drop it on their docs/homepage. CORS-open, edge-cached.',
      },
      {
        status: 'live',
        title: 'Open API v1',
        body: 'Free REST endpoints for /proposals, /daos, /alerts with bearer auth, generous fair-use quotas, burst limits.',
      },
      {
        status: 'building',
        title: 'Weekly digest email',
        body: 'Gemini summarizes the week\'s top proposals, whale moves, score changes. First public issue ships next Monday 08:00 UTC.',
      },
      {
        status: 'next',
        title: 'Telegram bot for whale alerts',
        body: 'Per-DAO channels, watchlist push, rich formatting. Pipeline already supports it — just need the bot token.',
      },
      {
        status: 'next',
        title: 'Discord webhook integration',
        body: 'For DAO ops teams that live in Discord. One webhook URL, all alerts for selected DAOs.',
      },
    ],
  },
  {
    q: 'Phase 03',
    title: 'Sustainability',
    highlight: '· Q3 2026',
    items: [
      {
        status: 'next',
        title: 'Public-goods grant funding',
        body: 'Funded by the ecosystem, free for the ecosystem: Arbitrum LTIPP, Optimism RetroPGF, ENS Public Goods, Gitcoin. The core watchdog stays free forever — no paywalls on public data, ever. We may offer optional paid services for teams that want dedicated support.',
      },
      {
        status: 'next',
        title: 'DAO treasury watchlists',
        body: 'Monitor every DAO where you hold tokens and get a cross-portfolio governance digest — free for all users.',
      },
      {
        status: 'next',
        title: 'Voting-power simulator',
        body: '"If I delegate 100k tokens to address X, how often would my position swing the vote?" — historical replay against the last 12 months.',
      },
      {
        status: 'idea',
        title: 'Self-host & open data exports',
        body: 'Docs to run your own instance, plus bulk dataset snapshots so researchers can work offline. Public infrastructure should be forkable.',
      },
    ],
  },
  {
    q: 'Phase 04',
    title: 'Scale',
    highlight: '· Q4 2026',
    items: [
      {
        status: 'live',
        title: 'On-chain governance (Tally)',
        body: 'Tally Governor proposals for Compound, Uniswap, ENS, Arbitrum, Optimism & Aave now ingest alongside Snapshot — on-chain DAOs are covered.',
      },
      {
        status: 'idea',
        title: 'Coordinated voting clustering',
        body: 'Move from heuristic (3+ identical votes in tight window) to address-similarity graph + on-chain funding-source tracing.',
      },
      {
        status: 'idea',
        title: 'Delegate scorecards',
        body: 'Individual delegate report cards: consistency, response time, voting bloc affiliation. Embeddable, shareable.',
      },
      {
        status: 'idea',
        title: 'Governance-news Twitter bot',
        body: 'Auto-posts whale alerts and Democracy Score moves to @DAOSentinel in real time — the viral distribution loop.',
      },
    ],
  },
  {
    q: 'Phase 05',
    title: 'Beyond DAOs',
    highlight: '· 2027+',
    items: [
      {
        status: 'idea',
        title: 'Protocol-parameter monitoring',
        body: 'Track DeFi protocol parameter changes (lending rates, fee tiers, oracle updates) the same way — many are governance-adjacent.',
      },
      {
        status: 'idea',
        title: 'Foundation-treasury tracking',
        body: 'Sister product for ecosystem foundations and DAO LLCs — extends watchdog mission beyond on-chain DAOs.',
      },
      {
        status: 'idea',
        title: 'AI governance copilot',
        body: 'Per-user GPT trained on your portfolio: "summarize this week\'s active proposals across my watchlist, flag anything risky."',
      },
    ],
  },
];

export default function RoadmapPage() {
  return (
    <>
      <Header />
      <main className="container-mc" style={{ paddingTop: 140, paddingBottom: 80 }}>
        <div className="sec-head reveal" style={{ maxWidth: 760, marginBottom: 64 }}>
          <span className="eyebrow">The trajectory</span>
          <h1
            className="mt-3 text-5xl font-semibold leading-tight md:text-6xl"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.03em',
            }}
          >
            Where DAO Sentinel
            <br />
            <span className="grad-text">is heading.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[hsl(var(--text-dim))]">
            What we shipped, what we&apos;re wiring up now, and the multi-year arc — from a
            free Snapshot watchdog to the canonical transparency layer for on-chain governance.
          </p>
        </div>

        {/* Status legend */}
        <div className="mb-12 flex flex-wrap gap-3">
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <div
              key={s}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs mono"
              style={{
                background: 'hsl(var(--panel) / 0.6)',
                boxShadow: `inset 0 0 0 1px ${STATUS_COLOR[s]}30`,
                color: STATUS_COLOR[s],
              }}
            >
              {STATUS_LABEL[s]}
            </div>
          ))}
        </div>

        {/* Phases */}
        <div className="space-y-16">
          {PHASES.map((phase) => (
            <section key={phase.q}>
              <div className="mb-6 flex items-baseline gap-4">
                <div
                  className="mono text-xs uppercase tracking-[0.18em] text-[hsl(var(--indigo-bright))]"
                >
                  {phase.q}
                </div>
                <h2
                  className="text-2xl font-semibold md:text-3xl"
                  style={{
                    fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {phase.title}
                  {phase.highlight && (
                    <span className="ml-2 text-base font-normal text-[hsl(var(--text-dim))] mono">
                      {phase.highlight}
                    </span>
                  )}
                </h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {phase.items.map((item) => (
                  <div key={item.title} className="glass-card">
                    <div
                      className="mb-3 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider mono"
                      style={{
                        background: `${STATUS_COLOR[item.status]}1f`,
                        color: STATUS_COLOR[item.status],
                        boxShadow: `inset 0 0 0 1px ${STATUS_COLOR[item.status]}55`,
                      }}
                    >
                      {STATUS_LABEL[item.status]}
                    </div>
                    <h3
                      className="mb-2 text-lg font-semibold leading-snug"
                      style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                    >
                      {item.title}
                    </h3>
                    <p className="text-sm text-[hsl(var(--text-dim))]">{item.body}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div
          className="mt-20 rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(165deg, hsl(var(--indigo) / 0.12), hsl(var(--panel) / 0.4))',
            boxShadow: 'inset 0 0 0 1px hsl(var(--indigo) / 0.25)',
          }}
        >
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            Steer the roadmap
          </span>
          <h2
            className="mt-3 text-3xl font-semibold"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.02em',
            }}
          >
            Something missing?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[hsl(var(--text-dim))]">
            Open an issue on GitHub or email the team — every feature on this page started as a
            user request. Public-good infrastructure is built in the open.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/Dev-In-Crypt/GovWatch/issues"
              target="_blank"
              rel="noreferrer"
              className="btn-mc btn-mc-primary"
            >
              File a feature request →
            </a>
            <a href="mailto:hello@daosentinel.xyz" className="btn-mc btn-mc-ghost">
              Email the team
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
