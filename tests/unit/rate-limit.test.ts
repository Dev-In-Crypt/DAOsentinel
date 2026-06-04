import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@/server/api/rate-limit';

describe('rate limiter', () => {
  it('allows up to N tokens', () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 1_000).ok).toBe(true);
    }
    expect(checkRateLimit(key, 5, 1_000).ok).toBe(false);
  });

  it('refills after window', async () => {
    const key = `r:${Math.random()}`;
    expect(checkRateLimit(key, 1, 30).ok).toBe(true);
    expect(checkRateLimit(key, 1, 30).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(checkRateLimit(key, 1, 30).ok).toBe(true);
  });

  it('reports remaining correctly', () => {
    const key = `c:${Math.random()}`;
    const r1 = checkRateLimit(key, 3, 1_000);
    expect(r1.remaining).toBe(2);
    const r2 = checkRateLimit(key, 3, 1_000);
    expect(r2.remaining).toBe(1);
  });
});
