'use client';
import { createContext, useContext } from 'react';
import type { OrgBranding } from '@/lib/org-branding';

const OrgBrandingContext = createContext<OrgBranding | null>(null);

/**
 * Makes the org branding resolved in the root layout (from the
 * `x-org-branding` header middleware attaches — see src/middleware.ts)
 * available to client components, notably Header.tsx. `null` is the default
 * case (no org subdomain matched) and must leave everything unchanged.
 */
export function OrgBrandingProvider({
  branding,
  children,
}: {
  branding: OrgBranding | null;
  children: React.ReactNode;
}) {
  return <OrgBrandingContext.Provider value={branding}>{children}</OrgBrandingContext.Provider>;
}

export function useOrgBranding(): OrgBranding | null {
  return useContext(OrgBrandingContext);
}
