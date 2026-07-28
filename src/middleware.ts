import { NextResponse, type NextRequest } from 'next/server';
import { ORG_BRANDING_HEADER } from '@/lib/org-branding';

/**
 * White-label subdomain routing (TODO-058).
 *
 * WHY NOT QUERY THE DB HERE: this file runs on the Edge runtime by default
 * on Vercel, which does not support the raw TCP Postgres connections the
 * `postgres` npm package needs (see src/server/db/index.ts). A Node.js
 * middleware runtime does exist in this Next.js version (internally wired
 * as `loadNodeMiddleware()` in next-server.js), but it isn't exposed through
 * any documented/typed config option in this install (grepping the shipped
 * .d.ts files for `nodeMiddleware` turns up nothing) — meaning it's still an
 * unstable/undocumented internal, not something to build a paid-tier
 * production feature on. So: stay on Edge, and do the actual DB lookup from
 * a normal Node-runtime Route Handler instead
 * (src/app/api/internal/org-by-subdomain/route.ts), which this file reaches
 * over `fetch()` — fetch IS Edge-compatible.
 *
 * Placement: this repo uses a `src/` layout (`src/app`), so Next.js expects
 * `src/middleware.ts` here rather than a root-level `middleware.ts`. Verified
 * by running the dev server and confirming requests are actually
 * intercepted (see TODO-058 verification notes).
 *
 * Self-fetch target: deliberately built from NEXTAUTH_URL / the production
 * default (the same "APP_BASE" convention already used in
 * src/app/api/feed/**and src/app/api/ics/** ) rather than from
 * `request.url`/`request.nextUrl`. The incoming request's own Host header
 * (e.g. `testorg.daosentinel.xyz`) is exactly the thing we can't yet
 * resolve — in local dev it isn't real DNS, and depending on it here would
 * make the internal lookup fetch fragile. NEXTAUTH_URL always points at this
 * same running deployment (Vercel serves every white-label subdomain off the
 * same deployment via wildcard DNS), so it's a reliable, environment-stable
 * target in both dev and prod.
 */

const ROOT_DOMAIN = 'daosentinel.xyz';
const APP_BASE_URL = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

function isMainAppHost(hostname: string): boolean {
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  // Vercel preview deployments (project-git-branch-team.vercel.app) — always
  // the main app, never a client subdomain.
  if (hostname.endsWith('.vercel.app')) return true;
  return false;
}

/**
 * Pulls the candidate org subdomain label out of a request hostname.
 * Supports `<sub>.daosentinel.xyz` (the production convention — see
 * `organizations.subdomain` in src/server/db/schema.ts, which stores just
 * the label, not a full custom domain) and, for local testing convenience,
 * `<sub>.localhost`.
 */
function extractSubdomain(hostname: string): string | null {
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  }
  if (hostname.endsWith('.localhost')) {
    return hostname.slice(0, -'.localhost'.length);
  }
  return null;
}

export async function middleware(request: NextRequest) {
  // Strip any client-supplied value for this header up front, on every path.
  // It's only ever meant to be set below, from the trusted DB-backed lookup
  // — without this, a caller could spoof branding on their own request on
  // any fail-open path (harmless — self-request-scoped, no cross-user or
  // cached effect — but there's no reason to let untrusted input reach the
  // header at all when stripping it costs nothing).
  const cleanHeaders = new Headers(request.headers);
  cleanHeaders.delete(ORG_BRANDING_HEADER);

  const hostHeader = request.headers.get('host') ?? '';
  const hostname = hostHeader.split(':')[0].toLowerCase();

  if (isMainAppHost(hostname)) {
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  const subdomain = extractSubdomain(hostname);
  if (!subdomain) {
    // Unrecognized host shape (bare IP, an unmapped custom domain, etc.) —
    // fail open and just show the normal public site.
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  try {
    const lookupUrl = new URL('/api/internal/org-by-subdomain', APP_BASE_URL);
    lookupUrl.searchParams.set('subdomain', subdomain);

    const res = await fetch(lookupUrl);
    if (!res.ok) {
      // No active org for this subdomain (404), or the lookup route errored
      // — fail open rather than break the request.
      return NextResponse.next({ request: { headers: cleanHeaders } });
    }

    const org = await res.json();
    cleanHeaders.set(ORG_BRANDING_HEADER, JSON.stringify(org));

    return NextResponse.next({ request: { headers: cleanHeaders } });
  } catch {
    // Network/DB hiccup on the lookup — fail open.
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }
}

export const config = {
  // Only run on page navigations, never on API routes or static assets:
  //  - excluding /api is what keeps this from recursively re-triggering
  //    itself when it fetches /api/internal/org-by-subdomain above.
  //  - excluding _next/static, _next/image, favicon.ico, and anything with a
  //    file extension avoids doing a DB-lookup fetch for every asset.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
