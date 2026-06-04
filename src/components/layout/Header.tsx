'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandMark } from './BrandMark';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on);
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <nav className={'mc-nav' + (scrolled ? ' scrolled' : '')}>
      <div className="mc-nav-inner">
        <Link href="/" className="mc-brand">
          <BrandMark />
          DAO Sentinel
        </Link>
        <div className="mc-nav-links">
          <Link href="/daos">DAOs</Link>
          <Link href="/proposals">Proposals</Link>
          <Link href="/alerts">Alerts</Link>
          <Link href="/delegates">Delegates</Link>
          <Link href="/digest">Digest</Link>
        </div>
        <div className="mc-nav-cta">
          <Link href="/login" className="signin">
            Sign in
          </Link>
          <Link href="/dashboard" className="btn-mc btn-mc-primary">
            Start watching
          </Link>
        </div>
      </div>
    </nav>
  );
}
