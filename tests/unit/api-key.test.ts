import { describe, it, expect } from 'vitest';
import { generateApiKey } from '@/server/api/auth-key';

describe('API key generator', () => {
  it('starts with gw_ prefix', () => {
    expect(generateApiKey()).toMatch(/^gw_/);
  });

  it('is URL-safe base64 of >= 32 bytes', () => {
    const k = generateApiKey();
    expect(k.length).toBeGreaterThan(40);
    expect(k).toMatch(/^gw_[A-Za-z0-9_-]+$/);
  });

  it('produces unique keys', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(set.size).toBe(100);
  });
});
