import { describe, it, expect } from 'vitest';
import { buildDaoLinks } from '@/server/services/org-onboarding';

describe('buildDaoLinks', () => {
  it('builds one link per daoSlug that resolves to a known DAO, preserving order', () => {
    const links = buildDaoLinks(
      'org-1',
      ['acme', 'acme-grants'],
      [
        { slug: 'acme', name: 'Acme DAO' },
        { slug: 'acme-grants', name: 'Acme Grants' },
      ],
    );
    expect(links).toEqual([
      { daoName: 'Acme DAO', daoSlug: 'acme', url: expect.stringContaining('/org/org-1/acme') },
      {
        daoName: 'Acme Grants',
        daoSlug: 'acme-grants',
        url: expect.stringContaining('/org/org-1/acme-grants'),
      },
    ]);
  });

  it('returns an empty array for an all-DAOs org (empty daoSlugs)', () => {
    expect(buildDaoLinks('org-1', [], [])).toEqual([]);
  });

  it('skips a slug that does not resolve to any known DAO row', () => {
    const links = buildDaoLinks('org-1', ['acme', 'ghost-dao'], [{ slug: 'acme', name: 'Acme DAO' }]);
    expect(links).toHaveLength(1);
    expect(links[0].daoSlug).toBe('acme');
  });

  it('includes the organizationId and daoSlug in the built URL', () => {
    const [link] = buildDaoLinks('org-abc', ['uniswap'], [{ slug: 'uniswap', name: 'Uniswap' }]);
    expect(link.url).toMatch(/\/org\/org-abc\/uniswap$/);
  });
});
