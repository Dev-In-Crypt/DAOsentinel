import { describe, it, expect, vi } from 'vitest';
import { DaoSentinelClient, DaoSentinelError } from '../src/index';

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

describe('DaoSentinelClient', () => {
  it('throws if constructed without an apiKey', () => {
    // @ts-expect-error — intentionally omitting the required field
    expect(() => new DaoSentinelClient({})).toThrow(/requires an apiKey/);
  });

  it('sends the API key as a Bearer authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new DaoSentinelClient({ apiKey: 'gw_test', fetch: fetchMock });

    await client.listDaos();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe('Bearer gw_test');
  });

  it('listDaos builds the correct URL and returns the data array', async () => {
    const daos = [{ slug: 'uniswap', name: 'Uniswap' }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: daos }));
    const client = new DaoSentinelClient({
      apiKey: 'k',
      baseUrl: 'https://example.test',
      fetch: fetchMock,
    });

    const result = await client.listDaos({ limit: 5 });

    expect(result).toEqual(daos);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/api/v1/daos?limit=5');
  });

  it('listProposals passes through state/dao/limit/offset and returns the full page shape', async () => {
    const page = { data: [{ id: '1', title: 'Test proposal' }], limit: 10, offset: 20 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page));
    const client = new DaoSentinelClient({
      apiKey: 'k',
      baseUrl: 'https://example.test',
      fetch: fetchMock,
    });

    const result = await client.listProposals({
      state: 'active',
      dao: 'arbitrum',
      limit: 10,
      offset: 20,
    });

    expect(result).toEqual(page);
    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/api/v1/proposals');
    expect(parsed.searchParams.get('state')).toBe('active');
    expect(parsed.searchParams.get('dao')).toBe('arbitrum');
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect(parsed.searchParams.get('offset')).toBe('20');
  });

  it('omits undefined params from the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new DaoSentinelClient({
      apiKey: 'k',
      baseUrl: 'https://example.test',
      fetch: fetchMock,
    });

    await client.listAlerts({ type: 'whale_vote' });

    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('type')).toBe('whale_vote');
    expect(parsed.searchParams.has('severity')).toBe(false);
    expect(parsed.searchParams.has('limit')).toBe(false);
  });

  it('listAlerts unwraps the data array', async () => {
    const alerts = [{ id: 'a1', type: 'whale_vote', severity: 'critical' }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: alerts }));
    const client = new DaoSentinelClient({ apiKey: 'k', fetch: fetchMock });

    const result = await client.listAlerts({ severity: 'critical' });
    expect(result).toEqual(alerts);
  });

  it('parses rate-limit headers into lastRateLimit after a request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { data: [] },
        {
          headers: {
            'x-ratelimit-limit-month': '5000',
            'x-ratelimit-remaining-month': '4999',
            'x-ratelimit-remaining-burst': '4',
          },
        },
      ),
    );
    const client = new DaoSentinelClient({ apiKey: 'k', fetch: fetchMock });

    expect(client.lastRateLimit).toBeNull();
    await client.listDaos();
    expect(client.lastRateLimit).toEqual({
      limitMonth: 5000,
      remainingMonth: 4999,
      remainingBurst: 4,
    });
  });

  it('throws DaoSentinelError with status and parsed body on a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'invalid_api_key' }, { status: 401 }),
    );
    const client = new DaoSentinelClient({ apiKey: 'bad', fetch: fetchMock });

    await expect(client.listDaos()).rejects.toMatchObject({
      status: 401,
      body: { error: 'invalid_api_key' },
    });
    await expect(client.listDaos()).rejects.toBeInstanceOf(DaoSentinelError);
  });

  it('surfaces the rate_limited error shape from a 429 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'rate_limited', retryAfterMs: 950 }, { status: 429 }),
    );
    const client = new DaoSentinelClient({ apiKey: 'k', fetch: fetchMock });

    await expect(client.listAlerts()).rejects.toMatchObject({
      status: 429,
      body: { error: 'rate_limited', retryAfterMs: 950 },
    });
  });

  it('strips a trailing slash from a custom baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new DaoSentinelClient({
      apiKey: 'k',
      baseUrl: 'https://example.test/',
      fetch: fetchMock,
    });

    await client.listDaos();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/api/v1/daos');
  });
});
