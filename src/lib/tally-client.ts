/**
 * Minimal Tally GraphQL client. Mirrors the shape of snapshot-client.ts.
 *
 * Tally requires an API key for every request. If `TALLY_API_KEY` is unset
 * we treat every call as a graceful no-op so the rest of the cron pipeline
 * keeps running — same pattern as openrouter.ts.
 */

export const TALLY_ENDPOINT = 'https://api.tally.xyz/query';

export interface TallyProposalRaw {
  id: string;
  onchainId: string | null;
  status: string; // ACTIVE | DEFEATED | EXECUTED | CANCELED | PENDING | QUEUED | SUCCEEDED | EXPIRED
  metadata: { title?: string; description?: string } | null;
  block: { timestamp: string } | null;
  start: { timestamp: string } | null;
  end: { timestamp: string } | null;
  proposer: { address: string } | null;
  voteStats: Array<{
    type: string; // for | against | abstain | pending-against | pending-for | pending-abstain
    votesCount: string;
    votersCount: number;
    percent: number;
  }> | null;
  organization: { id: string; name: string } | null;
}

const PROPOSALS_QUERY = /* GraphQL */ `
  query Proposals($input: ProposalsInput!) {
    proposals(input: $input) {
      nodes {
        ... on Proposal {
          id
          onchainId
          status
          metadata {
            title
            description
          }
          block {
            timestamp
          }
          start {
            ... on Block {
              timestamp
            }
          }
          end {
            ... on Block {
              timestamp
            }
          }
          proposer {
            address
          }
          voteStats {
            type
            votesCount
            votersCount
            percent
          }
          organization {
            id
            name
          }
        }
      }
      pageInfo {
        firstCursor
        lastCursor
        count
      }
    }
  }
`;

export interface TallyFetchOptions {
  limit?: number;
}

/** Returns null when the API key is missing — caller should skip-with-warn. */
export async function fetchTallyProposals(
  organizationId: string,
  opts: TallyFetchOptions = {},
): Promise<TallyProposalRaw[] | null> {
  const apiKey = process.env.TALLY_API_KEY;
  if (!apiKey) return null;
  const limit = opts.limit ?? 50;

  const body = {
    query: PROPOSALS_QUERY,
    variables: {
      input: {
        filters: { organizationId },
        page: { limit },
        sort: { sortBy: 'id', isDescending: true },
      },
    },
  };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(TALLY_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Api-Key': apiKey,
        'user-agent': 'daosentinel/0.1 (+https://daosentinel.xyz)',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn('[tally] HTTP', res.status, await res.text().catch(() => ''));
      return [];
    }
    const json = (await res.json()) as {
      data?: { proposals?: { nodes?: TallyProposalRaw[] } };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      console.warn('[tally] graphql error', json.errors[0]?.message);
      return [];
    }
    return json.data?.proposals?.nodes ?? [];
  } catch (e) {
    console.warn('[tally] fetch failed', (e as Error).message);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Map Tally's verbose lifecycle states down to our 3-value enum. */
export function mapTallyState(status: string): 'pending' | 'active' | 'closed' {
  const s = status.toUpperCase();
  if (s === 'ACTIVE' || s === 'PENDING') return s === 'PENDING' ? 'pending' : 'active';
  return 'closed';
}

/**
 * Derive a human title for a Tally proposal. On-chain Governors (especially
 * Compound) sometimes store stub titles like "0x0", "Proposal", or "" — fall
 * back to the first meaningful line of the description, then to a derived
 * "{DAO} proposal #{id}" label. Pure; extracted from tally-sync for testing.
 */
export function deriveTallyTitle(
  rawTitleInput: string | null | undefined,
  body: string | null | undefined,
  daoName: string,
  fallbackId: string,
): string {
  const rawTitle = rawTitleInput?.trim() ?? '';
  const isStubTitle =
    !rawTitle ||
    rawTitle.length < 6 ||
    /^(0x[0-9a-f]*|proposal|untitled)$/i.test(rawTitle);
  const firstDescLine = (body ?? '')
    .replace(/^[#\s>*_-]+/gm, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 8 && l.length <= 200);
  return (
    isStubTitle ? (firstDescLine ?? `${daoName} proposal #${fallbackId}`) : rawTitle
  ).slice(0, 500);
}

/** Tally returns unix-seconds-as-string timestamps; convert defensively. */
export function tallyTsToDate(ts?: string | null): Date | null {
  if (!ts) return null;
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Tally returns seconds; check magnitude to avoid double-converting
  return new Date(n < 1e12 ? n * 1000 : n);
}
