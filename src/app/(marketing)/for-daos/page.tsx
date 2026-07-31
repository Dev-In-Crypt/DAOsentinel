import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export const metadata = {
  title: 'For DAOs & governance teams — DAO Sentinel',
  description:
    'Optional paid services for DAO foundations, core teams, and governance providers — governance concierge, priority infrastructure, and white-label dashboards. The public product stays free.',
};

interface Product {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
}

const PRODUCTS: Product[] = [
  {
    eyebrow: 'Concierge',
    title: 'Governance concierge',
    body: 'A dedicated contact who configures and maintains your watchlists and thresholds, adds human context to alerts, and prepares a private weekly report for your team — on top of the same data everyone already gets for free.',
    bullets: [
      'Org-scoped alert configuration, tuned to what actually matters to you',
      'Human-annotated context on whale votes, swings, and quorum risk',
      'A private weekly report, delivered directly to your team',
    ],
  },
  {
    eyebrow: 'Infrastructure',
    title: 'Priority infrastructure',
    body: 'Materially fresher data for your DAO — a faster sync cadence than the standard public schedule — plus a dedicated support channel for your team.',
    bullets: [
      'Faster refresh cadence for your DAO specifically',
      'Dedicated Slack/Discord/email support channel',
      'Usually bundled with the concierge tier',
    ],
  },
  {
    eyebrow: 'White-label',
    title: 'White-label hosted dashboard',
    // The example must be a label under daosentinel.xyz. `extractSubdomain`
    // (src/middleware.ts) matches only `<label>.daosentinel.xyz`, so a
    // customer's own domain resolves to nothing and falls through to the
    // public site. This page previously offered `governance.yourdao.xyz`,
    // which is a promise the product cannot keep and a sales call would have
    // had to walk back.
    body: 'A co-branded instance of the same dashboard — your logo, your colors, your own subdomain on daosentinel.xyz — for a single DAO or a governance provider’s whole book of DAOs.',
    bullets: [
      'Co-branded subdomain (e.g. yourdao.daosentinel.xyz)',
      'Optional scope restriction to your licensed DAOs only',
      'Setup + ongoing support included',
    ],
  },
];

export default function ForDaosPage() {
  return (
    <>
      <Header />
      <main className="container-mc" style={{ paddingTop: 140, paddingBottom: 80 }}>
        <div className="sec-head" style={{ maxWidth: 760, marginBottom: 32 }}>
          <span className="eyebrow">For DAOs & teams</span>
          <h1
            className="mt-3 text-5xl font-semibold leading-tight md:text-6xl"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.03em',
            }}
          >
            Dedicated support,
            <br />
            <span className="grad-text">for your DAO specifically.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[hsl(var(--text-dim))]">
            The public dashboard, alerts, and API are free for everyone — always. These are
            optional add-on services for foundations, core teams, and governance providers who
            want more than the public product provides.
          </p>
        </div>

        <div
          className="mb-12 rounded-xl px-5 py-4 text-sm"
          style={{
            background: 'hsl(var(--mint) / 0.10)',
            boxShadow: 'inset 0 0 0 1px hsl(var(--mint) / 0.28)',
          }}
        >
          <span className="mono uppercase tracking-wider" style={{ color: 'hsl(var(--mint))' }}>
            Nothing below gates the free product
          </span>{' '}
          — every dashboard, alert, and API endpoint you can use today stays exactly as free as it
          is now. This page describes optional services on top of it, not a paywall on it.
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PRODUCTS.map((p) => (
            <div key={p.title} className="glass-card flex flex-col">
              <span
                className="mb-3 inline-block w-fit rounded px-2 py-0.5 text-xs mono uppercase tracking-wider"
                style={{
                  background: 'hsl(var(--indigo) / 0.14)',
                  color: 'hsl(var(--indigo-bright))',
                  boxShadow: 'inset 0 0 0 1px hsl(var(--indigo) / 0.35)',
                }}
              >
                {p.eyebrow}
              </span>
              <h3
                className="mb-2 text-lg font-semibold"
                style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
              >
                {p.title}
              </h3>
              <p className="mb-4 text-sm text-[hsl(var(--text-dim))]">{p.body}</p>
              <ul className="mt-auto space-y-2 text-sm">
                {p.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-[hsl(var(--text-dim))]">
                    <span style={{ color: 'hsl(var(--mint))' }}>✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 rounded-2xl p-8 text-center"
          style={{
            background: 'linear-gradient(165deg, hsl(var(--indigo) / 0.12), hsl(var(--panel) / 0.4))',
            boxShadow: 'inset 0 0 0 1px hsl(var(--indigo) / 0.25)',
          }}
        >
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            Let&apos;s talk
          </span>
          <h2
            className="mt-3 text-3xl font-semibold"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.02em',
            }}
          >
            Interested in one of these?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[hsl(var(--text-dim))]">
            Tell us about your DAO and what you need — no self-serve checkout yet, just a
            conversation with the team.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:hello@daosentinel.xyz?subject=DAO%20services%20inquiry"
              className="btn-mc btn-mc-primary"
            >
              Email the team →
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
