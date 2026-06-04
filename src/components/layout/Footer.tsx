import Link from 'next/link';
import { BrandMark } from './BrandMark';

const COLS = [
  { h: 'Platform', links: [['Whale detection', '/alerts'], ['Turnout analytics', '/daos'], ['Delegate maps', '/delegates'], ['Treasury watch', '/daos']] },
  { h: 'Resources', links: [['Docs', '#'], ['Democracy Score', '/daos'], ['API reference', '#'], ['Changelog', '#']] },
  { h: 'Company', links: [['About', '#'], ['Careers', '#'], ['Blog', '#'], ['Contact', '#']] },
] as const;

export function Footer() {
  return (
    <footer className="mc-footer">
      <div className="container-mc">
        <div className="foot-grid">
          <div className="foot-brand">
            <Link href="/" className="mc-brand">
              <BrandMark />
              GovWatch
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
          <span>© 2026 GovWatch Labs · Built for governance vigilance</span>
          <span>Data from Snapshot &amp; on-chain sources</span>
        </div>
      </div>
    </footer>
  );
}
