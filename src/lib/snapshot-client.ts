import { GraphQLClient } from 'graphql-request';

export const SNAPSHOT_ENDPOINT = 'https://hub.snapshot.org/graphql';

// No API key required for basic access. Rate limit: 120 req / 20 sec.
export const snapshotClient = new GraphQLClient(SNAPSHOT_ENDPOINT, {
  headers: {
    'content-type': 'application/json',
    'user-agent': 'daosentinel/0.1 (+https://daosentinel.xyz)',
  },
});

export const PROPOSALS_QUERY = /* GraphQL */ `
  query Proposals($spaces: [String!], $state: String, $first: Int!, $skip: Int!) {
    proposals(
      first: $first
      skip: $skip
      where: { space_in: $spaces, state: $state }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      title
      body
      discussion
      choices
      start
      end
      snapshot
      state
      author
      type
      scores
      scores_total
      votes
      quorum
      space {
        id
        name
      }
    }
  }
`;

export const VOTES_QUERY = /* GraphQL */ `
  query Votes($proposal: String!, $first: Int!, $skip: Int!) {
    votes(
      first: $first
      skip: $skip
      where: { proposal: $proposal }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      voter
      vp
      created
      choice
      reason
    }
  }
`;

/**
 * `admins`/`members`/`moderators`/`treasuries` are the space's own declaration
 * of which addresses belong to the DAO (TODO-074). They are the only
 * authoritative source we have for calling an address DAO-controlled or a
 * treasury — everything else would be inference dressed up as fact.
 *
 * All four are optional in practice: plenty of spaces leave them empty, and
 * callers must treat a missing list as "unknown", never as "not a DAO address".
 */
export const SPACE_QUERY = /* GraphQL */ `
  query Space($id: String!) {
    space(id: $id) {
      id
      name
      about
      avatar
      website
      symbol
      network
      followersCount
      proposalsCount
      admins
      members
      moderators
      treasuries {
        name
        address
        network
      }
    }
  }
`;

export interface SnapshotProposal {
  id: string;
  title: string;
  body: string | null;
  discussion: string | null;
  choices: string[];
  start: number;
  end: number;
  snapshot: string;
  state: 'pending' | 'active' | 'closed';
  author: string;
  type: string;
  scores: number[] | null;
  scores_total: number | null;
  votes: number;
  quorum: number;
  space: { id: string; name: string };
}

export interface SnapshotVote {
  id: string;
  voter: string;
  vp: number;
  created: number;
  choice: number | number[] | Record<string, number>;
  reason: string | null;
}

export interface SnapshotTreasury {
  name: string | null;
  address: string | null;
  network: string | null;
}

export interface SnapshotSpace {
  id: string;
  name: string;
  about: string | null;
  avatar: string | null;
  website: string | null;
  symbol: string | null;
  network: string | null;
  followersCount: number;
  proposalsCount: number;
  // Nullable across the board: the hub omits these for spaces that never set
  // them, and an absent list means "we don't know", not "there are none".
  admins: string[] | null;
  members: string[] | null;
  moderators: string[] | null;
  treasuries: SnapshotTreasury[] | null;
}

// Token-bucket-ish helper to stay within 120 req / 20 s
const REQUEST_WINDOW_MS = 20_000;
const MAX_REQUESTS_PER_WINDOW = 110;
const requestTimestamps: number[] = [];

async function throttle() {
  const now = Date.now();
  while (requestTimestamps.length && now - requestTimestamps[0] > REQUEST_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const wait = REQUEST_WINDOW_MS - (now - requestTimestamps[0]) + 50;
    await new Promise((r) => setTimeout(r, wait));
  }
  requestTimestamps.push(Date.now());
}

export async function snapshotRequest<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  await throttle();
  return snapshotClient.request<T>(query, variables);
}
