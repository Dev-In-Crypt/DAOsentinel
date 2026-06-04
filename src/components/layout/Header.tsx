'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { BrandMark } from './BrandMark';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const { data: session, status } = useSession();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on);
    return () => window.removeEventListener('scroll', on);
  }, []);

  const isAuthed = status === 'authenticated' && session?.user;

  return (
    <nav className={'mc-nav' + (scrolled ? ' scrolled' : '')}>
      <div className="mc-nav-inner">
        <Link href="/" className="mc-brand">
          <BrandMark />
          DAO Sentinel
        </Link>
        <div className="mc-nav-links">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/daos">DAOs</Link>
          <Link href="/proposals">Proposals</Link>
          <Link href="/alerts">Alerts</Link>
          <Link href="/delegates">Delegates</Link>
          <Link href="/digest">Digest</Link>
        </div>
        <div className="mc-nav-cta">
          {isAuthed ? (
            <>
              <Link href="/settings" className="signin" title={session.user!.email ?? ''}>
                {session.user!.email?.split('@')[0] ?? 'Account'}
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="btn-mc btn-mc-ghost"
                style={{ padding: '9px 16px', fontSize: 14 }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="btn-mc btn-mc-primary"
              style={{ padding: '9px 22px', fontSize: 14 }}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
