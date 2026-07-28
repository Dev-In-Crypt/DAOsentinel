import { describe, it, expect } from 'vitest';
import { findAccessibleOrg } from '@/server/api/org-auth';
import type { Organization } from '@/server/db/schema';

let seq = 0;
function makeOrg(overrides: Partial<Organization> = {}): Organization {
  seq += 1;
  return {
    id: `org-${seq}`,
    name: `Org ${seq}`,
    daoSlugs: [],
    tier: 'priority',
    billingContactEmail: 'billing@example.com',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    brandingLogoUrl: null,
    brandingPrimaryColor: null,
    brandingDisplayName: null,
    subdomain: null,
    active: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('findAccessibleOrg (org access-control matching logic)', () => {
  it('returns the org when it is active and daoSlug is in scope', () => {
    const org = makeOrg({ active: true, daoSlugs: ['uniswap', 'aave'] });
    const result = findAccessibleOrg([org], 'aave');
    expect(result).toEqual(org);
  });

  it('returns null when the only matching-scope org is not active', () => {
    const org = makeOrg({ active: false, daoSlugs: ['uniswap'] });
    const result = findAccessibleOrg([org], 'uniswap');
    expect(result).toBeNull();
  });

  it('returns null when the org is active but daoSlug is not in its scope', () => {
    const org = makeOrg({ active: true, daoSlugs: ['uniswap'] });
    const result = findAccessibleOrg([org], 'aave');
    expect(result).toBeNull();
  });

  it('returns null when the user has no organizations at all', () => {
    const result = findAccessibleOrg([], 'uniswap');
    expect(result).toBeNull();
  });

  it('returns the correct match among multiple orgs when only one qualifies', () => {
    const inactiveMatch = makeOrg({ active: false, daoSlugs: ['aave'] });
    const wrongScope = makeOrg({ active: true, daoSlugs: ['compound'] });
    const goodOrg = makeOrg({ active: true, daoSlugs: ['aave', 'uniswap'] });
    const result = findAccessibleOrg([inactiveMatch, wrongScope, goodOrg], 'aave');
    expect(result).toEqual(goodOrg);
  });
});
