/* GovWatch — nav + landing sections */
const { useState: useStateS, useEffect: useEffectS, useRef: useRefS } = React;

/* ---- abstract geometric icons (24px stroke) ---- */
const ic = (paths) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke="var(--indigo-bright)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);
const ICONS = {
  whale: ic(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>),
  turnout: ic(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  power: ic(<><circle cx="8" cy="8" r="4" /><circle cx="17" cy="16" r="2.4" /><circle cx="6.5" cy="18" r="1.6" /><path d="M11 11l4 3.5" /></>),
  proposal: ic(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>),
  treasury: ic(<><path d="M3 9l9-5 9 5M5 9v9a1 1 0 001 1h12a1 1 0 001-1V9M9 19v-6h6v6" /></>),
  delegate: ic(<><circle cx="12" cy="6" r="2.4" /><circle cx="5" cy="17" r="2.4" /><circle cx="19" cy="17" r="2.4" /><path d="M11 8l-5 7M13 8l5 7M9 18h6" /></>),
};

function Nav() {
  const [scrolled, setScrolled] = useStateS(false);
  useEffectS(() => {
    const on = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', on); on();
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <nav className={'nav' + (scrolled ? ' scrolled' : '')}>
      <div className="nav-inner">
        <div className="brand">
          <span className="brand-mark">
            <span className="bm-ring r2" /><span className="bm-ring r1" />
            <span className="bm-core" /><span className="bm-dot" />
          </span>
          GovWatch
        </div>
        <div className="nav-links">
          <a href="#platform">Platform</a>
          <a href="#metrics">Metrics</a>
          <a href="#pricing">Pricing</a>
          <a href="#docs">Docs</a>
        </div>
        <div className="nav-cta">
          <a className="signin" href="#signin">Sign in</a>
          <a className="btn btn-primary" href="#start">Start watching</a>
        </div>
      </div>
    </nav>
  );
}

const FEATURES = [
  { k: 'whale', t: 'Whale detection', d: 'Real-time alerts the moment a single wallet swings a vote past your quorum thresholds — with delegation tracing.', tag: 'Live alerts' },
  { k: 'turnout', t: 'Turnout analytics', d: 'Participation curves per proposal, per delegate, per cohort. Spot apathy before it becomes capture.', tag: 'Time series' },
  { k: 'power', t: 'Power concentration', d: 'Gini and Nakamoto coefficients computed continuously across the full holder set of every monitored DAO.', tag: 'Gini · Nakamoto' },
  { k: 'proposal', t: 'Proposal tracking', d: 'Every on-chain and Snapshot proposal, normalized into one feed with outcomes, quorum, and timelines.', tag: '2,840 tracked' },
  { k: 'treasury', t: 'Treasury watch', d: 'Follow the money: spend authorizations, multisig changes, and runway across $11.9B in DAO treasuries.', tag: 'Multi-chain' },
  { k: 'delegate', t: 'Delegate maps', d: 'Visualize who really holds the power — delegation graphs that expose hidden voting blocs and proxies.', tag: 'Graph view' },
];

function Features() {
  return (
    <section className="block container" id="platform">
      <div className="sec-head reveal">
        <span className="eyebrow">The platform</span>
        <h2>Six instruments, one cockpit.</h2>
        <p>GovWatch fuses on-chain data, Snapshot, and delegate registries into a single
          situational-awareness layer for DAO governance.</p>
      </div>
      <div className="feat-grid">
        {FEATURES.map((f, i) => (
          <div className="feat-card reveal" key={f.k} style={{ transitionDelay: (i % 3) * 80 + 'ms' }}>
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

function Pipeline() {
  const steps = [
    { n: '01', t: 'Ingest', d: 'We stream governance events from 9 chains, Snapshot spaces, and delegate registries — normalized within seconds of finality.' },
    { n: '02', t: 'Score', d: 'Every DAO is scored on turnout, decentralization, and transparency, rolled into a single Democracy Score you can trust.' },
    { n: '03', t: 'Alert', d: 'Set thresholds once. GovWatch pings you on Telegram, Discord, or webhook the instant governance integrity is at risk.' },
  ];
  return (
    <section className="block container">
      <div className="sec-head reveal">
        <span className="eyebrow">How it works</span>
        <h2>From raw chain data to a single signal.</h2>
      </div>
      <div className="pipe">
        {steps.map((s, i) => (
          <div className="pipe-step reveal" key={s.n} style={{ transitionDelay: i * 90 + 'ms' }}>
            <div className="pipe-num">{s.n}</div>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricsBand() {
  return (
    <section className="block container" id="metrics">
      <div className="metrics-band reveal">
        <div className="mb-grid">
          <div className="mb-item"><div className="mb-num">142</div><div className="mb-lab">DAOs monitored</div></div>
          <div className="mb-item"><div className="mb-num"><span className="accent">$11.9</span>B</div><div className="mb-lab">Treasury under watch</div></div>
          <div className="mb-item"><div className="mb-num">316</div><div className="mb-lab">Whale alerts in 24h</div></div>
          <div className="mb-item"><div className="mb-num"><span className="accent">9</span></div><div className="mb-lab">Chains indexed</div></div>
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  const logos = [
    { n: 'Uniswap', c: '#FF2D78' }, { n: 'Optimism', c: '#FF4654' }, { n: 'ENS', c: '#5298FF' },
    { n: 'Arbitrum', c: '#29A3F0' }, { n: 'Lido', c: '#54B6F0' }, { n: 'Gitcoin', c: '#12B981' },
  ];
  return (
    <section className="block container">
      <div className="sec-head center reveal">
        <span className="eyebrow" style={{ justifyContent: 'center' }}>Trusted by stewards</span>
        <h2>Delegates and foundations run on GovWatch.</h2>
      </div>
      <div className="quotes">
        <div className="quote-card feature reveal">
          <blockquote>"We caught a coordinated delegation attack 40 minutes before the vote closed. GovWatch's whale alert paid for itself a hundred times over that day."</blockquote>
          <div className="quote-who">
            <div className="qw-av">MR</div>
            <div><div className="qw-name">Maya Reyes</div><div className="qw-role">Lead Delegate · DeFi collective</div></div>
          </div>
        </div>
        <div className="quote-card reveal" style={{ transitionDelay: '90ms' }}>
          <blockquote>"The Democracy Score is now in our quarterly board deck. It's the first governance metric our LPs actually understand."</blockquote>
          <div className="quote-who">
            <div className="qw-av">TK</div>
            <div><div className="qw-name">Tomas Kael</div><div className="qw-role">Foundation Ops · L2 ecosystem</div></div>
          </div>
        </div>
      </div>
      <div className="logos-row reveal">
        {logos.map((l) => (
          <span className="lg" key={l.n}><span className="lg-dot" style={{ background: l.c, boxShadow: '0 0 10px ' + l.c }} />{l.n}</span>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  const tiers = [
    {
      name: 'Observer', amt: '$0', per: '/forever', pop: false,
      desc: 'Watch the universe. Public dashboards for everyone.',
      cta: 'Get started', ghost: true,
      feats: [['5 DAOs on your watchlist', 1], ['Daily Democracy Score digest', 1], ['Public proposal feed', 1], ['Whale alerts (hourly batch)', 0], ['Delegation graphs', 0]],
    },
    {
      name: 'Analyst', amt: '$49', per: '/month', pop: true,
      desc: 'For delegates and researchers who act on the data.',
      cta: 'Start 14-day trial', ghost: false,
      feats: [['Unlimited DAO watchlist', 1], ['Real-time whale alerts', 1], ['Telegram · Discord · webhook', 1], ['Full delegation graphs', 1], ['Gini & Nakamoto exports', 1]],
    },
    {
      name: 'Institution', amt: 'Custom', per: '', pop: false,
      desc: 'For foundations, funds, and protocol teams.',
      cta: 'Talk to us', ghost: true,
      feats: [['Everything in Analyst', 1], ['Private DAO integrations', 1], ['API & data warehouse sync', 1], ['Custom scoring models', 1], ['Dedicated governance analyst', 1]],
    },
  ];
  return (
    <section className="block container" id="pricing">
      <div className="sec-head center reveal">
        <span className="eyebrow" style={{ justifyContent: 'center' }}>Pricing</span>
        <h2>Start watching free.</h2>
        <p>Scale up when governance integrity becomes mission-critical.</p>
      </div>
      <div className="price-grid">
        {tiers.map((t, i) => (
          <div className={'price-card reveal' + (t.pop ? ' pop' : '')} key={t.name} style={{ transitionDelay: i * 80 + 'ms' }}>
            {t.pop && <span className="pill price-badge" style={{ background: 'var(--indigo)', color: '#fff', boxShadow: '0 6px 18px -4px rgba(99,102,241,0.8)' }}>Most popular</span>}
            <div className="price-name">{t.name}</div>
            <div className="price-amt">{t.amt}<span className="per">{t.per}</span></div>
            <div className="price-desc">{t.desc}</div>
            <a className={'btn ' + (t.ghost ? 'btn-ghost' : 'btn-primary')} href="#start">{t.cta}</a>
            <ul className="price-feats">
              {t.feats.map((f, j) => (
                <li className={f[1] ? '' : 'muted'} key={j}>
                  <span className="ck">{f[1] ? '✓' : '○'}</span>{f[0]}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="block container">
      <div className="cta-final reveal">
        <h2>Don't let governance<br />slip by unwatched.</h2>
        <p>Join the delegates, funds, and foundations keeping on-chain democracy honest.</p>
        <div className="cta-actions">
          <a className="btn btn-primary" href="#start">Start watching free</a>
          <a className="btn btn-ghost" href="#demo">Book a demo</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { h: 'Platform', links: ['Whale detection', 'Turnout analytics', 'Delegate maps', 'Treasury watch'] },
    { h: 'Resources', links: ['Docs', 'Democracy Score', 'API reference', 'Changelog'] },
    { h: 'Company', links: ['About', 'Careers', 'Blog', 'Contact'] },
  ];
  return (
    <footer className="footer">
      <div className="container">
        <div className="foot-grid">
          <div className="foot-brand">
            <div className="brand">
              <span className="brand-mark">
                <span className="bm-ring r2" /><span className="bm-ring r1" />
                <span className="bm-core" /><span className="bm-dot" />
              </span>
              GovWatch
            </div>
            <p>Mission control for on-chain democracy. Independent, real-time, multi-chain governance monitoring.</p>
          </div>
          {cols.map((c) => (
            <div className="foot-col" key={c.h}>
              <h4>{c.h}</h4>
              {c.links.map((l) => <a href="#" key={l}>{l}</a>)}
            </div>
          ))}
        </div>
        <div className="foot-bottom">
          <span>© 2026 GovWatch Labs · Data shown is illustrative</span>
          <span>Built for governance vigilance</span>
        </div>
      </div>
    </footer>
  );
}

/* reveal-on-scroll observer (with safety fallback) */
function useReveal() {
  useEffectS(() => {
    const els = document.querySelectorAll('.reveal');
    let io;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { threshold: 0.12 });
      els.forEach((el) => io.observe(el));
    } else {
      els.forEach((el) => el.classList.add('in'));
    }
    // safety: guarantee everything is revealed even if the observer never fires
    const t = setTimeout(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in')), 2600);
    return () => { if (io) io.disconnect(); clearTimeout(t); };
  }, []);
}

function Sections() {
  useReveal();
  return (
    <main>
      <Features />
      <Pipeline />
      <MetricsBand />
      <SocialProof />
      <Pricing />
      <FinalCTA />
    </main>
  );
}

Object.assign(window, { Nav, Sections, Footer });
