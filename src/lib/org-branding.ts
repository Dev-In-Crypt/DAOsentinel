/**
 * Shared contract between src/middleware.ts (Edge runtime) and the rest of
 * the app (Node runtime Server Components) for white-label subdomain
 * branding (TODO-058).
 *
 * Middleware cannot query Postgres directly (see middleware.ts for why), so
 * it fetches org branding from a Node-runtime API route and forwards the
 * result to the rest of the request as a JSON request header. This module
 * is intentionally dependency-free (no `next/headers`, no DB imports) so it
 * can be safely imported from both the Edge middleware and Node server
 * components without pulling in anything Edge-incompatible.
 */

/** Request header middleware attaches when an org subdomain match is found. */
export const ORG_BRANDING_HEADER = 'x-org-branding';

export interface OrgBranding {
  name: string;
  daoSlugs: string[];
  brandingLogoUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingDisplayName: string | null;
}

/** Narrow, defensive parse — never throws. Returns null on anything unexpected. */
export function parseOrgBranding(raw: string | null | undefined): OrgBranding | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.name !== 'string') return null;
    return {
      name: parsed.name,
      daoSlugs: Array.isArray(parsed.daoSlugs) ? parsed.daoSlugs.filter((s: unknown) => typeof s === 'string') : [],
      brandingLogoUrl: typeof parsed.brandingLogoUrl === 'string' ? parsed.brandingLogoUrl : null,
      brandingPrimaryColor: typeof parsed.brandingPrimaryColor === 'string' ? parsed.brandingPrimaryColor : null,
      brandingDisplayName: typeof parsed.brandingDisplayName === 'string' ? parsed.brandingDisplayName : null,
    };
  } catch {
    return null;
  }
}
