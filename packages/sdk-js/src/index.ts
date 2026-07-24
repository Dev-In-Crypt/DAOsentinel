/**
 * Typed client for the DAO Sentinel public API (docs: /api-docs).
 * Thin wrapper over the 3 existing v1 REST endpoints — no new data work,
 * just packaging. Zero runtime dependencies: uses the platform `fetch`.
 */

export interface DaoSentinelClientOptions {
  /** API key from Settings → API key. Sent as `Authorization: Bearer <apiKey>`. */
  apiKey: string;
  /** Defaults to the production API. Override for local/self-hosted instances. */
  baseUrl?: string;
  /** Inject a fetch implementation for runtimes without a global one. */
  fetch?: typeof fetch;
}

export interface Dao {
  slug: string;
  name: string;
  chain: string | null;
  governanceToken: string | null;
  democracyScore: string | null;
  scoreBreakdown: Record<string, number> | null;
  treasuryUsd: string | null;
  totalProposals: number | null;
}

export type ProposalState = 'active' | 'closed' | 'pending';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface Proposal {
  id: string;
  externalId: string;
  title: string;
  author: string;
  state: ProposalState;
  startTimestamp: string;
  endTimestamp: string;
  votesCount: number | null;
  aiSummary: string | null;
  aiRiskLevel: RiskLevel | null;
  hasWhaleVote: boolean | null;
  hasLastMinuteSwing: boolean | null;
  daoSlug: string;
  daoName: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  data: Record<string, unknown> | null;
  createdAt: string;
  daoSlug: string;
  daoName: string;
}

export interface ListDaosParams {
  /** Max 300, default 100. */
  limit?: number;
}

export interface ListProposalsParams {
  state?: ProposalState;
  /** DAO slug, e.g. "uniswap". */
  dao?: string;
  /** Max 200, default 50. */
  limit?: number;
  offset?: number;
}

export interface ListAlertsParams {
  type?: string;
  severity?: string;
  /** Max 200, default 50. */
  limit?: number;
}

export interface ProposalsPage {
  data: Proposal[];
  limit: number;
  offset: number;
}

/** Rate-limit state from the most recent response's headers. Null fields mean the header wasn't present (e.g. before the first request). */
export interface RateLimitInfo {
  limitMonth: number | null;
  remainingMonth: number | null;
  remainingBurst: number | null;
}

/** Thrown for any non-2xx response. `body` is the parsed JSON error payload when available (e.g. `{ error: "invalid_api_key" }`). */
export class DaoSentinelError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`DAO Sentinel API error ${status}: ${safeStringify(body)}`);
    this.name = 'DaoSentinelError';
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_BASE_URL = 'https://www.daosentinel.xyz';

export class DaoSentinelClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  /** Rate-limit headers from the most recent request. Null before any request has been made. */
  lastRateLimit: RateLimitInfo | null = null;

  constructor(options: DaoSentinelClientOptions) {
    if (!options.apiKey) {
      throw new Error('DaoSentinelClient requires an apiKey (see /settings for a free key)');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const fetchFn = options.fetch ?? globalThis.fetch;
    if (!fetchFn) {
      throw new Error(
        'No global fetch found — pass one via the `fetch` option (e.g. on older Node runtimes)',
      );
    }
    this.fetchFn = fetchFn;
  }

  /** GET /api/v1/daos — all monitored DAOs with current Democracy Score. */
  async listDaos(params: ListDaosParams = {}): Promise<Dao[]> {
    const { data } = await this.request<{ data: Dao[] }>('/api/v1/daos', params);
    return data;
  }

  /** GET /api/v1/proposals — proposals across all DAOs, filterable + paginated. */
  async listProposals(params: ListProposalsParams = {}): Promise<ProposalsPage> {
    return this.request<ProposalsPage>('/api/v1/proposals', params);
  }

  /** GET /api/v1/alerts — whale votes, swings, score drops, filterable by type/severity. */
  async listAlerts(params: ListAlertsParams = {}): Promise<Alert[]> {
    const { data } = await this.request<{ data: Alert[] }>('/api/v1/alerts', params);
    return data;
  }

  private async request<T>(path: string, params: object): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params) as Array<
      [string, string | number | boolean | undefined]
    >) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const res = await this.fetchFn(url.toString(), {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });

    this.lastRateLimit = {
      limitMonth: toNumberOrNull(res.headers.get('x-ratelimit-limit-month')),
      remainingMonth: toNumberOrNull(res.headers.get('x-ratelimit-remaining-month')),
      remainingBurst: toNumberOrNull(res.headers.get('x-ratelimit-remaining-burst')),
    };

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new DaoSentinelError(res.status, body);
    }
    return body as T;
  }
}

function toNumberOrNull(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
