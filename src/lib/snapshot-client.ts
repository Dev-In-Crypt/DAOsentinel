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
