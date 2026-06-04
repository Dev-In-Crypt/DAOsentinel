import { describe, it, expect } from 'vitest';

/**
 * Hits the badge route handler directly. Mocks the DB to return a fake DAO.
 */
import { vi } from 'vitest';

vi.mock('@/server/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ name: 'Uniswap', score: '67.5' }]),
        }),
      }),
    }),
  },
}));

import { GET } from '@/app/api/badge/[slug]/route';

describe('badge SVG endpoint', () => {
  it('returns image/svg+xml with score embedded', async () => {
    const res = await GET(new Request('http://localhost/api/badge/uniswap'), {
      params: Promise.resolve({ slug: 'uniswap' }),
    });
    expect(res.headers.get('content-type')).toMatch(/image\/svg\+xml/);
    const body = await res.text();
    expect(body).toContain('<svg');
    expect(body).toContain('68/100');
    expect(body).toContain('Democracy Score');
  });

  it('exposes CORS for embedding on any domain', async () => {
    const res = await GET(new Request('http://localhost/api/badge/uniswap'), {
      params: Promise.resolve({ slug: 'uniswap' }),
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
