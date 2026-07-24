'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { BrandMark } from './BrandMark';

const NAV_LINKS = [
  ['/dashboard', 'Dashboard'],
  ['/daos', 'DAOs'],
  ['/proposals', 'Proposals'],
  ['/alerts', 'Alerts'],
  ['/delegates', 'Delegates'],
  ['/digest', 'Digest'],
] as const;

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session, status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on);
    return () => window.removeEventListener('scroll', on);
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const isAuthed = status === 'authenticated' && session?.user;

  return (
    <nav className={'mc-nav' + (scrolled ? ' scrolled' : '') + (menuOpen ? ' menu-open' : '')}>
      <div className="mc-nav-inner">
        <Link href="/" className="mc-brand">
          <BrandMark />
          DAO Sentinel
        </Link>

        <div className="mc-nav-links">
          {NAV_LINKS.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
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

        {/* Mobile hamburger — only visible ≤980px via CSS */}
        <button
          type="button"
          className="mc-nav-burger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className={'burger-box' + (menuOpen ? ' open' : '')}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {/* Mobile drawer */}
      <div className={'mc-nav-mobile' + (menuOpen ? ' open' : '')}>
        <div className="mc-nav-mobile-links">
          {NAV_LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? 'active' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link href="/compare" onClick={() => setMenuOpen(false)}>
            Compare
          </Link>
          <Link href="/delegates/blocs" onClick={() => setMenuOpen(false)}>
            Voting blocs
          </Link>
          <Link href="/delegates/recommended" onClick={() => setMenuOpen(false)}>
            Recommended delegates
          </Link>
          <Link href="/delegates/silent-power" onClick={() => setMenuOpen(false)}>
            Silent power
          </Link>
        </div>
        <div className="mc-nav-mobile-cta">
          {isAuthed ? (
            <>
              <Link href="/settings" className="btn-mc btn-mc-ghost" onClick={() => setMenuOpen(false)}>
                {session.user!.email?.split('@')[0] ?? 'Account'}
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="btn-mc btn-mc-ghost"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-mc btn-mc-primary" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
