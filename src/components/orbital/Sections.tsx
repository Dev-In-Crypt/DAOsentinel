'use client';
import { useEffect } from 'react';
import { NewsletterForm } from '@/components/NewsletterForm';

const ICONS = {
  whale: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--indigo-bright))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </svg>
  ),
  turnout: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--indigo-bright))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  power: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--indigo-bright))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="4" />
      <circle cx="17" cy="16" r="2.4" />
      <circle cx="6.5" cy="18" r="1.6" />
      <path d="M11 11l4 3.5" />
    </svg>
  ),
  proposal: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--indigo-bright))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  ),
  treasury: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--indigo-bright))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-5 9 5M5 9v9a1 1 0 001 1h12a1 1 0 001-1V9M9 19v-6h6v6" />
    </svg>
  ),
  delegate: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--indigo-bright))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="6" r="2.4" />
      <circle cx="5" cy="17" r="2.4" />
      <circle cx="19" cy="17" r="2.4" />
      <path d="M11 8l-5 7M13 8l5 7M9 18h6" />
    </svg>
  ),
} as const;

const FEATURES: Array<{ k: keyof typeof ICONS; t: string; d: string; tag: string }> = [
  {
    k: 'whale',
    t: 'Whale detection',
    d: 'Real-time alerts the moment a single wallet swings a vote past your quorum thresholds — with delegation tracing.',
    tag: 'Live alerts',
  },
  {
    k: 'turnout',
    t: 'Turnout analytics',
    d: 'Participation curves per proposal, per delegate, per cohort. Spot apathy before it becomes capture.',
    tag: 'Time series',
  },
  {
    k: 'power',
    t: 'Power concentration',
    d: 'Gini coefficient computed continuously across the full voter set of every monitored DAO.',
    tag: 'Gini coefficient',
  },
  {
    k: 'proposal',
    t: 'Proposal tracking',
    d: 'Every Snapshot proposal, normalized into one feed with AI summaries, outcomes, quorum, and timelines.',
    tag: 'AI summaries',
  },
  {
    k: 'treasury',
    t: 'Treasury watch',
    d: 'Follow the money: spend authorizations, multisig changes, and runway across $11.9B in DAO treasuries.',
    tag: 'Multi-chain',
  },
  {
    k: 'delegate',
    t: 'Delegate maps',
    d: 'See who really holds the power — cross-DAO delegate profiles that expose hidden voting blocs and proxies.',
    tag: 'Cross-DAO',
  },
];

export function FeaturesSection() {
  return (
    <section className="block container-mc" id="platform">
      <div className="sec-head reveal">
        <span className="eyebrow">The platform</span>
        <h2>Six instruments, one cockpit.</h2>
        <p>
          DAO Sentinel fuses on-chain data, Snapshot, and delegate registries into a single
          situational-awareness layer for DAO governance.
        </p>
      </div>
      <div className="feat-grid">
        {FEATURES.map((f, i) => (
          <div
            className="feat-card reveal"
            key={f.k}
            style={{ transitionDelay: (i % 3) * 80 + 'ms' }}
          >
            <div className="feat-ico">{ICONS[f.k]}</div>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
            <span className="pill feat-tag">{f.tag}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PipelineSection() {
  const steps = [
    {
      n: '01',
      t: 'Ingest',
      d: 'We stream governance events from Snapshot and on-chain sources — normalized within seconds of finality.',
    },
    {
      n: '02',
      t: 'Score',
      d: 'Every DAO is scored on turnout, decentralization, and transparency, rolled into a single Democracy Score you can trust.',
    },
    {
      n: '03',
      t: 'Alert',
      d: 'Set thresholds once. DAO Sentinel pings you on Telegram, Discord, or webhook the instant governance integrity is at risk.',
    },
  ];
  return (
    <section className="block container-mc">
      <div className="sec-head reveal">
        <span className="eyebrow">How it works</span>
        <h2>From raw chain data to a single signal.</h2>
      </div>
      <div className="pipe">
        {steps.map((s, i) => (
          <div
            className="pipe-step reveal"
            key={s.n}
            style={{ transitionDelay: i * 90 + 'ms' }}
          >
            <div className="pipe-num">{s.n}</div>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MetricsBand({
  daos,
  treasuryUsd,
  whaleAlerts24h,
  chains,
  votesTracked,
}: {
  daos: number;
  treasuryUsd: number;
  whaleAlerts24h: number;
  chains: number;
  votesTracked: number;
}) {
  return (
    <section className="block container-mc" id="metrics">
      <div className="metrics-band reveal">
        <div className="mb-grid">
          <div className="mb-item">
            <div className="mb-num">{daos}</div>
            <div className="mb-lab">DAOs monitored</div>
          </div>
          {treasuryUsd >= 100_000_000 ? (
            <div className="mb-item">
              <div className="mb-num">
                <span className="accent">${(treasuryUsd / 1e9).toFixed(1)}</span>B
              </div>
              <div className="mb-lab">Treasury under watch</div>
            </div>
          ) : (
            <div className="mb-item">
              <div className="mb-num">
                <span className="accent">{votesTracked.toLocaleString()}</span>
              </div>
              <div className="mb-lab">Votes tracked</div>
            </div>
          )}
          <div className="mb-item">
            <div className="mb-num">{whaleAlerts24h}</div>
            <div className="mb-lab">Whale alerts in 24h</div>
          </div>
          <div className="mb-item">
            <div className="mb-num">
              <span className="accent">{chains}</span>
            </div>
            <div className="mb-lab">Chains indexed</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SocialProof() {
  const logos = [
    { n: 'Uniswap', c: '#FF2D78' },
    { n: 'Optimism', c: '#FF4654' },
    { n: 'ENS', c: '#5298FF' },
    { n: 'Arbitrum', c: '#29A3F0' },
    { n: 'Lido', c: '#54B6F0' },
    { n: 'Gitcoin', c: '#12B981' },
  ];
  return (
    <section className="block container-mc">
      <div className="sec-head center reveal">
        <span className="eyebrow" style={{ justifyContent: 'center' }}>
          Trusted by stewards
        </span>
        <h2>Delegates and foundations run on DAO Sentinel.</h2>
      </div>
      <div className="quotes">
        <div className="quote-card feature reveal">
          <blockquote>
            "We caught a coordinated delegation attack 40 minutes before the vote closed.
            DAO Sentinel's whale alert paid for itself a hundred times over that day."
          </blockquote>
          <div className="quote-who">
            <div className="qw-av">MR</div>
            <div>
              <div className="qw-name">Maya Reyes</div>
              <div className="qw-role">Lead Delegate · DeFi collective</div>
            </div>
          </div>
        </div>
        <div className="quote-card reveal" style={{ transitionDelay: '90ms' }}>
          <blockquote>
            "The Democracy Score is now in our quarterly board deck. It's the first governance
            metric our LPs actually understand."
          </blockquote>
          <div className="quote-who">
            <div className="qw-av">TK</div>
            <div>
              <div className="qw-name">Tomas Kael</div>
              <div className="qw-role">Foundation Ops · L2 ecosystem</div>
            </div>
          </div>
        </div>
      </div>
      <div className="logos-row reveal">
        {logos.map((l) => (
          <span className="lg" key={l.n}>
            <span
              className="lg-dot"
              style={{ background: l.c, boxShadow: `0 0 10px ${l.c}` }}
            />
            {l.n}
          </span>
        ))}
      </div>
    </section>
  );
}

const TIERS = [
  {
    name: 'Observer',
    amt: '$0',
    per: '/forever',
    pop: false,
    desc: 'Watch the universe. Public dashboards for everyone.',
    cta: 'Get started',
    ghost: true,
    feats: [
      ['5 DAOs on your watchlist', 1],
      ['Weekly Democracy Score digest', 1],
      ['Public proposal feed + AI summaries', 1],
      ['Whale alerts (hourly batch)', 0],
      ['API access', 0],
    ] as Array<[string, number]>,
    href: '/dashboard',
  },
  {
    name: 'Delegate Pro',
    amt: '$99',
    per: '/month',
    pop: true,
    desc: 'For delegates and researchers who act on the data.',
    cta: 'Start subscription',
    ghost: false,
    feats: [
      ['Unlimited DAO watchlist', 1],
      ['Real-time whale alerts', 1],
      ['Telegram · Discord · webhook', 1],
      ['Coordinated voting detection', 1],
      ['API · 1,000 calls/mo', 1],
    ] as Array<[string, number]>,
    href: '/pricing',
  },
  {
    name: 'Fund Suite',
    amt: '$399',
    per: '/month',
    pop: false,
    desc: 'For foundations, funds, and protocol teams.',
    cta: 'Talk to us',
    ghost: true,
    feats: [
      ['Everything in Delegate Pro', 1],
      ['Portfolio governance dashboard', 1],
      ['Voting power simulation', 1],
      ['API · 10,000 calls/mo', 1],
      ['Dedicated governance analyst', 1],
    ] as Array<[string, number]>,
    href: '/pricing',
  },
];

export function PricingSection() {
  return (
    <section className="block container-mc" id="pricing">
      <div className="sec-head center reveal">
        <span className="eyebrow" style={{ justifyContent: 'center' }}>
          Pricing
        </span>
        <h2>Free for everyone.</h2>
        <p>Scale up when governance integrity becomes mission-critical.</p>
      </div>
      <div className="price-grid">
        {TIERS.map((t, i) => (
          <div
            className={'price-card reveal' + (t.pop ? ' pop' : '')}
            key={t.name}
            style={{ transitionDelay: i * 80 + 'ms' }}
          >
            {t.pop && <span className="pill price-badge">Most popular</span>}
            <div className="price-name">{t.name}</div>
            <div className="price-amt">
              {t.amt}
              <span className="per">{t.per}</span>
            </div>
            <div className="price-desc">{t.desc}</div>
            <a
              className={'btn-mc ' + (t.ghost ? 'btn-mc-ghost' : 'btn-mc-primary')}
              style={{ justifyContent: 'center', width: '100%' }}
              href={t.href}
            >
              {t.cta}
            </a>
            <ul className="price-feats">
              {t.feats.map(([label, on], j) => (
                <li className={on ? '' : 'muted'} key={j}>
                  <span className="ck">{on ? '✓' : '○'}</span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NewsletterSection() {
  return (
    <section className="block container-mc" id="newsletter">
      <div
        className="reveal mx-auto max-w-3xl rounded-2xl p-10 text-center"
        style={{
          background:
            'linear-gradient(165deg, hsl(var(--indigo) / 0.14), hsl(var(--panel) / 0.5))',
          boxShadow:
            'inset 0 0 0 1px hsl(var(--indigo) / 0.28), 0 24px 60px -30px rgba(0,0,0,0.6)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(500px 250px at 50% 0%, hsl(var(--cyan) / 0.10), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            The weekly briefing
          </span>
          <h2
            className="mt-3 text-3xl font-semibold md:text-4xl"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.02em',
            }}
          >
            Get the digest <span className="grad-text">in your inbox</span>.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[hsl(var(--text-dim))]">
            Every Monday at 08:00 UTC. Top proposals, whale activity, Democracy Score movers,
            deadlines to watch — distilled by AI in under 600 words.
          </p>
          <div className="mt-6">
            <NewsletterForm />
          </div>
          <p className="mt-4 text-xs text-[hsl(var(--text-faint))]">
            One email a week. Unsubscribe with one click.
          </p>
        </div>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="block container-mc">
      <div className="cta-final reveal">
        <h2>
          Don't let governance
          <br />
          slip by unwatched.
        </h2>
        <p>
          Join the delegates, funds, and foundations keeping on-chain democracy honest.
        </p>
        <div className="cta-actions">
          <a className="btn-mc btn-mc-primary" href="/login">
            Sign in
          </a>
          <a className="btn-mc btn-mc-ghost" href="/dashboard">
            Open dashboard
          </a>
        </div>
      </div>
    </section>
  );
}

export function RevealOnScroll() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('in');
              io!.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12 },
      );
      els.forEach((el) => io!.observe(el));
    } else {
      els.forEach((el) => el.classList.add('in'));
    }
    const t = setTimeout(
      () => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in')),
      2600,
    );
    return () => {
      io?.disconnect();
      clearTimeout(t);
    };
  }, []);
  return null;
}
