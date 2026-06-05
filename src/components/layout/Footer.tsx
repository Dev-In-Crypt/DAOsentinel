import Link from 'next/link';
import { BrandMark } from './BrandMark';

const COLS = [
  { h: 'Platform', links: [['Whale detection', '/alerts'], ['Turnout analytics', '/daos'], ['Delegate maps', '/delegates'], ['Weekly digest', '/digest']] },
  { h: 'Analytics', links: [['Compare DAOs', '/compare'], ['Voting blocs', '/delegates/blocs'], ['Democracy Score', '/daos'], ['Roadmap', '/roadmap']] },
  { h: 'Resources', links: [['Docs', '/docs'], ['API reference', '/api-docs'], ['Pricing', '/pricing'], ['Source code', 'https://github.com/Dev-In-Crypt/GovWatch']] },
] as const;

export function Footer() {
  return (
    <footer className="mc-footer">
      <div className="container-mc">
        <div className="foot-grid">
          <div className="foot-brand">
            <Link href="/" className="mc-brand">
              <BrandMark />
              DAO Sentinel
            </Link>
            <p>
              Mission control for on-chain democracy. Independent, real-time, multi-chain
              governance monitoring.
            </p>
          </div>
          {COLS.map((c) => (
            <div className="foot-col" key={c.h}>
              <h4>{c.h}</h4>
              {c.links.map(([label, href]) => (
                <Link key={label} href={href}>
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="foot-bottom">
          <span>© 2026 DAO Sentinel Labs · Built for governance vigilance</span>
          <span>Data from Snapshot &amp; on-chain sources</span>
        </div>
      </div>
    </footer>
  );
}
