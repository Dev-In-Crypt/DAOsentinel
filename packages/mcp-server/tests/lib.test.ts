import { describe, it, expect } from 'vitest';
import { buildUrl, formatApiError } from '../src/lib.js';

describe('buildUrl', () => {
  it('joins a base URL and path', () => {
    expect(buildUrl('https://example.test', '/api/v1/daos')).toBe('https://example.test/api/v1/daos');
  });

  it('strips a trailing slash from the base URL', () => {
    expect(buildUrl('https://example.test/', '/api/v1/daos')).toBe('https://example.test/api/v1/daos');
  });

  it('appends provided params as a query string', () => {
    const url = buildUrl('https://example.test', '/api/v1/proposals', {
      state: 'active',
      dao: 'uniswap',
      limit: 10,
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/proposals');
    expect(parsed.searchParams.get('state')).toBe('active');
    expect(parsed.searchParams.get('dao')).toBe('uniswap');
    expect(parsed.searchParams.get('limit')).toBe('10');
  });

  it('omits undefined params from the query string', () => {
    const url = buildUrl('https://example.test', '/api/v1/alerts', {
      type: 'whale_vote',
      severity: undefined,
      limit: undefined,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('type')).toBe('whale_vote');
    expect(parsed.searchParams.has('severity')).toBe(false);
    expect(parsed.searchParams.has('limit')).toBe(false);
  });

  it('produces a query-string-free URL when no params are given', () => {
    expect(buildUrl('https://example.test', '/api/v1/daos', {})).toBe('https://example.test/api/v1/daos');
  });
});

describe('formatApiError', () => {
  it('gives a specific, actionable message for 401', () => {
    const msg = formatApiError(401, { error: 'invalid_api_key' });
    expect(msg).toContain('Authentication failed');
    expect(msg).toContain('invalid_api_key');
    expect(msg).toContain('/settings');
  });

  it('gives a specific, actionable message for 429', () => {
    const msg = formatApiError(429, { error: 'rate_limited' });
    expect(msg).toContain('Rate limited');
    expect(msg).toContain('rate_limited');
  });

  it('falls back to a generic message with status + body for other codes', () => {
    const msg = formatApiError(500, { error: 'internal_error' });
    expect(msg).toContain('500');
    expect(msg).toContain('internal_error');
  });

  it('handles a non-object body without throwing', () => {
    expect(() => formatApiError(500, null)).not.toThrow();
    expect(() => formatApiError(500, 'plain text error')).not.toThrow();
  });
});
