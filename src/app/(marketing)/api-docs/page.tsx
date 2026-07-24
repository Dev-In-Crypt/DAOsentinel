import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata = {
  title: 'API reference — DAO Sentinel',
  description: 'Free REST API for DAO governance data. Bearer auth, rate-limited, JSON.',
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre
      className="overflow-x-auto rounded-md p-4 text-xs mono"
      style={{
        background: 'hsl(var(--bg-2))',
        boxShadow: 'inset 0 0 0 1px hsl(var(--line))',
        lineHeight: 1.6,
      }}
    >
      {children}
    </pre>
  );
}

function Endpoint({
  method,
  path,
  desc,
  example,
  response,
}: {
  method: string;
  path: string;
  desc: string;
  example: string;
  response: string;
}) {
  return (
    <div className="glass-card">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="rounded px-2 py-0.5 text-xs mono"
          style={{
            background: 'hsl(var(--mint) / 0.14)',
            color: 'hsl(var(--mint))',
            boxShadow: 'inset 0 0 0 1px hsl(var(--mint) / 0.35)',
          }}
        >
          {method}
        </span>
        <code className="mono text-sm text-[hsl(var(--cyan))]">{path}</code>
      </div>
      <p className="mb-4 text-sm text-[hsl(var(--text-dim))]">{desc}</p>
      <div className="mb-3">
        <div className="mb-1 text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
          Request
        </div>
        <Code>{example}</Code>
      </div>
      <div>
        <div className="mb-1 text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
          Response
        </div>
        <Code>{response}</Code>
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <>
      <Header />
      <main className="container-mc" style={{ paddingTop: 140, paddingBottom: 80 }}>
        <div className="sec-head" style={{ maxWidth: 760, marginBottom: 48 }}>
          <span className="eyebrow">For builders</span>
          <h1
            className="mt-3 text-5xl font-semibold md:text-6xl"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.03em',
            }}
          >
            API <span className="grad-text">reference</span>
          </h1>
          <p className="mt-4 text-base text-[hsl(var(--text-dim))]">
            REST endpoints for DAO governance data. Bearer auth, free for everyone, fair-use
            rate-limited.
          </p>
        </div>

        {/* Authentication */}
        <section className="mb-12">
          <h2 className="app-sec-title">Authentication</h2>
          <div className="glass-card space-y-3">
            <p className="text-sm text-[hsl(var(--text-dim))]">
              Generate a free API key in{' '}
              <Link href="/settings" className="text-[hsl(var(--indigo-bright))] hover:underline">
                Settings
              </Link>{' '}
              — available to every signed-in user. Pass it as a bearer token in every request:
            </p>
            <Code>{`Authorization: Bearer gw_xxxxxxxxxxxxxxxxxxxxxxxx`}</Code>
            <p className="text-xs text-[hsl(var(--text-dim))]">
              Keys are prefixed <code className="mono">gw_</code>. Rotate any time in Settings.
              Lost keys cannot be recovered — only regenerated.
            </p>
          </div>
        </section>

        {/* Rate limits */}
        <section className="mb-12">
          <h2 className="app-sec-title">Rate limits</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="stat-cell">
              <div className="lab">Monthly quota</div>
              <div className="val"><span className="accent">5,000</span><span style={{ fontSize: 14, color: 'hsl(var(--text-dim))' }}> /mo</span></div>
              <p className="mt-2 text-xs text-[hsl(var(--text-dim))]">
                Free for every signed-in user. Need more for a public-goods project? Reach out.
              </p>
            </div>
            <div className="stat-cell">
              <div className="lab">Burst limit</div>
              <div className="val"><span className="accent">5</span><span style={{ fontSize: 14, color: 'hsl(var(--text-dim))' }}> req/sec</span></div>
              <p className="mt-2 text-xs text-[hsl(var(--text-dim))]">Per key, to keep the service healthy for all.</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-[hsl(var(--text-dim))]">
            Burst limit: 5 requests per second per key. Every response includes{' '}
            <code className="mono">x-ratelimit-remaining-month</code> and{' '}
            <code className="mono">x-ratelimit-remaining-burst</code> headers.
          </p>
        </section>

        {/* Endpoints */}
        <section className="mb-12">
          <h2 className="app-sec-title">Endpoints</h2>
          <div className="space-y-4">
            <Endpoint
              method="GET"
              path="/api/v1/daos"
              desc="List all monitored DAOs with current Democracy Score and breakdown."
              example={`curl https://daosentinel.xyz/api/v1/daos?limit=5 \\
  -H "Authorization: Bearer gw_..."`}
              response={`{
  "data": [
    {
      "slug": "uniswap",
      "name": "Uniswap",
      "chain": "ethereum",
      "governanceToken": "UNI",
      "democracyScore": "67.30",
      "scoreBreakdown": { ... },
      "treasuryUsd": "3100000000.00",
      "totalProposals": 234
    }
  ]
}`}
            />

            <Endpoint
              method="GET"
              path="/api/v1/proposals"
              desc="Proposals across all DAOs. Filter by state, DAO slug, paginate."
              example={`curl "https://daosentinel.xyz/api/v1/proposals?state=active&dao=arbitrum&limit=10" \\
  -H "Authorization: Bearer gw_..."`}
              response={`{
  "data": [
    {
      "id": "uuid",
      "externalId": "0xabc...",
      "title": "Activate v4 hooks on Base mainnet",
      "state": "active",
      "endTimestamp": "2026-06-15T20:00:00Z",
      "votesCount": 847,
      "aiSummary": "This proposal activates...",
      "aiRiskLevel": "high",
      "hasWhaleVote": true,
      "daoSlug": "uniswap",
      "daoName": "Uniswap"
    }
  ]
}`}
            />

            <Endpoint
              method="GET"
              path="/api/v1/alerts"
              desc="Alert feed — whale votes, last-minute swings, score drops. Filter by type and severity."
              example={`curl "https://daosentinel.xyz/api/v1/alerts?type=whale_vote&severity=critical&limit=20" \\
  -H "Authorization: Bearer gw_..."`}
              response={`{
  "data": [
    {
      "id": "uuid",
      "type": "whale_vote",
      "severity": "critical",
      "title": "🐳 Whale vote on Uniswap: 23.4% VP",
      "description": "0xabc...123 cast 2.1M UNI...",
      "data": { "voter": "0xabc...", "vp": 2100000, "vpPct": 23.4 },
      "createdAt": "2026-06-04T16:42:18Z",
      "daoSlug": "uniswap",
      "daoName": "Uniswap"
    }
  ]
}`}
            />
          </div>
        </section>

        {/* Official SDK */}
        <section className="mb-12">
          <h2 className="app-sec-title">JS/TS SDK</h2>
          <div className="glass-card space-y-3">
            <p className="text-sm text-[hsl(var(--text-dim))]">
              A typed client for all 3 endpoints above, zero runtime dependencies. Same MIT
              license as the rest of the project.
            </p>
            <Code>{`npm install dao-sentinel-sdk`}</Code>
            <Code>{`import { DaoSentinelClient } from 'dao-sentinel-sdk';

const client = new DaoSentinelClient({ apiKey: process.env.DAO_SENTINEL_API_KEY! });

const daos = await client.listDaos({ limit: 10 });
const { data: proposals } = await client.listProposals({ state: 'active', dao: 'uniswap' });
const alerts = await client.listAlerts({ severity: 'critical' });`}</Code>
            <p className="text-xs text-[hsl(var(--text-dim))]">
              Source:{' '}
              <a
                href="https://github.com/Dev-In-Crypt/DAOsentinel/tree/main/packages/sdk-js"
                target="_blank"
                rel="noreferrer"
                className="text-[hsl(var(--indigo-bright))] hover:underline"
              >
                packages/sdk-js
              </a>
              .
            </p>
          </div>
        </section>

        {/* Public endpoints */}
        <section className="mb-12">
          <h2 className="app-sec-title">Public endpoints (no auth)</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="glass-card">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="rounded px-2 py-0.5 text-xs mono"
                  style={{
                    background: 'hsl(var(--cyan) / 0.14)',
                    color: 'hsl(var(--cyan))',
                    boxShadow: 'inset 0 0 0 1px hsl(var(--cyan) / 0.35)',
                  }}
                >
                  GET
                </span>
                <code className="mono text-sm">/api/badge/[slug]</code>
              </div>
              <p className="mb-3 text-sm text-[hsl(var(--text-dim))]">
                Returns an SVG Democracy Score badge. Embeds anywhere.
              </p>
              <Code>{`<img src="https://daosentinel.xyz/api/badge/uniswap" />`}</Code>
            </div>
            <div className="glass-card">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="rounded px-2 py-0.5 text-xs mono"
                  style={{
                    background: 'hsl(var(--cyan) / 0.14)',
                    color: 'hsl(var(--cyan))',
                    boxShadow: 'inset 0 0 0 1px hsl(var(--cyan) / 0.35)',
                  }}
                >
                  GET
                </span>
                <code className="mono text-sm">/api/alerts/stream</code>
              </div>
              <p className="mb-3 text-sm text-[hsl(var(--text-dim))]">
                Server-Sent Events stream of new alerts in real time. Open from any client.
              </p>
              <Code>{`const es = new EventSource(
  'https://daosentinel.xyz/api/alerts/stream'
);
es.addEventListener('alert', (e) =>
  console.log(JSON.parse(e.data))
);`}</Code>
            </div>
          </div>
        </section>

        <div
          className="mt-12 rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(165deg, hsl(var(--indigo) / 0.12), hsl(var(--panel) / 0.4))',
            boxShadow: 'inset 0 0 0 1px hsl(var(--indigo) / 0.25)',
          }}
        >
          <h2
            className="text-2xl font-semibold"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.02em',
            }}
          >
            Ready to build?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-[hsl(var(--text-dim))]">
            Sign in, generate your free key from Settings, ship. No plan, no card.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/settings" className="btn-mc btn-mc-primary">
              Get your API key →
            </Link>
            <Link href="/docs" className="btn-mc btn-mc-ghost">
              Read the docs
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
