import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata = {
  title: 'Docs — DAO Sentinel',
  description: 'How DAO Sentinel works: data sources, Democracy Score formula, alert types, embeds.',
};

export default function DocsPage() {
  return (
    <>
      <Header />
      <main className="container-mc" style={{ paddingTop: 140, paddingBottom: 80 }}>
        <div className="sec-head" style={{ maxWidth: 760, marginBottom: 48 }}>
          <span className="eyebrow">The handbook</span>
          <h1
            className="mt-3 text-5xl font-semibold md:text-6xl"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.03em',
            }}
          >
            Docs
          </h1>
          <p className="mt-4 text-base text-[hsl(var(--text-dim))]">
            Everything we measure, how we measure it, and how to plug into the dataset.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="glass-card">
            <h2 className="app-sec-title">Data sources</h2>
            <ul className="space-y-2 text-sm text-[hsl(var(--text-dim))]">
              <li>
                <strong className="text-[hsl(var(--text))]">Snapshot GraphQL</strong> — off-chain
                proposals and votes for 50 monitored DAOs, polled every 5 minutes.
              </li>
              <li>
                <strong className="text-[hsl(var(--text))]">Tally API</strong> — on-chain Governor
                proposals (Compound, Uniswap, ENS, Arbitrum, Optimism, Aave), so we cover DAOs that
                vote on-chain rather than via Snapshot.
              </li>
              <li>
                <strong className="text-[hsl(var(--text))]">DeFiLlama &amp; CoinGecko</strong> — DAO
                treasury USD value (daily) and governance-token prices (every 6 hours).
              </li>
              <li>
                <strong className="text-[hsl(var(--text))]">ENS &amp; Karma</strong> — names and
                third-party reputation scores layered onto top delegate profiles.
              </li>
              <li>
                <strong className="text-[hsl(var(--text))]">No proprietary data</strong> — everything
                we use is public, free, and reproducible.
              </li>
            </ul>
          </section>

          <section className="glass-card">
            <h2 className="app-sec-title">Democracy Score formula</h2>
            <p className="mb-3 text-sm text-[hsl(var(--text-dim))]">
              Score 0-100 = weighted sum of five components, recomputed daily:
            </p>
            <ul className="space-y-2 text-sm mono">
              <li>participation × 0.25</li>
              <li>powerDistribution × 0.25 <span className="text-[hsl(var(--text-dim))]">(1 - Gini)</span></li>
              <li>proposalDiversity × 0.15 <span className="text-[hsl(var(--text-dim))]">(unique authors)</span></li>
              <li>delegateAccountability × 0.15</li>
              <li>manipulationResistance × 0.20</li>
            </ul>
          </section>

          <section className="glass-card">
            <h2 className="app-sec-title">Alert types</h2>
            <ul className="space-y-2 text-sm text-[hsl(var(--text-dim))]">
              <li>
                🐳 <strong className="text-[hsl(var(--text))]">Whale vote</strong> — single address
                {' '}≥5% of total VP. Severity by % (info / warning / critical).
              </li>
              <li>
                ⚡ <strong className="text-[hsl(var(--text))]">Last-minute swing</strong> — leading
                choice flips in the final 10% of voting window.
              </li>
              <li>
                ⚠ <strong className="text-[hsl(var(--text))]">Quorum risk</strong> — active proposal
                with &lt;80% of quorum and &gt;75% of window elapsed.
              </li>
              <li>
                📉 <strong className="text-[hsl(var(--text))]">Score drop</strong> — DAO Democracy
                Score loses ≥5 points day-over-day.
              </li>
              <li>
                🤝 <strong className="text-[hsl(var(--text))]">Coordinated voting</strong> — 3+
                addresses with similar VP voting identically inside the same hour.
              </li>
            </ul>
          </section>

          <section className="glass-card">
            <h2 className="app-sec-title">Embeddable badge</h2>
            <p className="mb-3 text-sm text-[hsl(var(--text-dim))]">
              Drop on your DAO docs, README, or homepage:
            </p>
            <pre
              className="overflow-x-auto rounded-md p-3 text-xs mono"
              style={{ background: 'hsl(var(--bg-2))', boxShadow: 'inset 0 0 0 1px hsl(var(--line))' }}
            >
{`<img
  src="https://daosentinel.xyz/api/badge/uniswap"
  alt="Democracy Score" />`}
            </pre>
            <p className="mt-3 text-xs text-[hsl(var(--text-dim))]">
              SVG, CORS-open, cached for 5 minutes at the edge. Replace{' '}
              <code className="mono">uniswap</code> with any DAO slug from{' '}
              <Link href="/daos" className="text-[hsl(var(--indigo-bright))] hover:underline">
                the explorer
              </Link>
              .
            </p>
          </section>
        </div>

        <section className="mt-12">
          <h2 className="app-sec-title">More</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Link
              href="/api-docs"
              className="glass-card block transition-colors hover:bg-[hsl(var(--accent)/0.3)]"
            >
              <h3
                className="mb-2 font-semibold"
                style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
              >
                API reference →
              </h3>
              <p className="text-sm text-[hsl(var(--text-dim))]">
                REST endpoints, authentication, rate limits, response shapes.
              </p>
            </Link>
            <Link
              href="/roadmap"
              className="glass-card block transition-colors hover:bg-[hsl(var(--accent)/0.3)]"
            >
              <h3
                className="mb-2 font-semibold"
                style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
              >
                Roadmap →
              </h3>
              <p className="text-sm text-[hsl(var(--text-dim))]">
                What we shipped, what&apos;s building, where we&apos;re heading.
              </p>
            </Link>
            <a
              href="https://github.com/Dev-In-Crypt/GovWatch"
              target="_blank"
              rel="noreferrer"
              className="glass-card block transition-colors hover:bg-[hsl(var(--accent)/0.3)]"
            >
              <h3
                className="mb-2 font-semibold"
                style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
              >
                Source code ↗
              </h3>
              <p className="text-sm text-[hsl(var(--text-dim))]">
                Everything is open-source. Fork, audit, contribute.
              </p>
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
