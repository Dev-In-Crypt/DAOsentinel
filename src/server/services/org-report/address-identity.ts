import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { addressLabels, delegates, votes } from '@/server/db/schema';
import { classifyOnChainAccount } from '@/lib/evm';
import { SPACE_QUERY, snapshotRequest, type SnapshotSpace } from '@/lib/snapshot-client';

/**
 * TODO-074: who is this address?
 *
 * The report previously offered two labels — "Known delegate" and "Recurring
 * voter we track" — so the address casting 68% of a vote read exactly like any
 * other wallet. That is the gap this closes, and the constraint it works under
 * is the same one that has governed every other section: **no label without a
 * source**.
 *
 * The ladder below is ordered by how strong the evidence is, and the first
 * match wins. Note what is deliberately absent: there is no `foundation`
 * label. Whether an address belongs to a project's foundation is not
 * something we can establish — the space's own admin/treasury lists are as far
 * as the evidence goes, and calling anything else "foundation-controlled"
 * would be exactly the confident invention this report refuses to make.
 */

export const ADDRESS_LABELS = [
  'dao_treasury',
  'dao_controlled',
  'identified_delegate',
  'multisig',
  'contract',
  'recurring_participant',
  'unidentified',
] as const;

export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export type AddressLabelSource =
  | 'snapshot_space'
  | 'onchain'
  | 'delegate_registry'
  | 'vote_history'
  | 'none';

export interface AddressIdentity {
  address: string;
  label: AddressLabel;
  source: AddressLabelSource;
  /** The evidence, in words — e.g. `AavegotchiDAO Treasury (Polygon)`. */
  sourceDetail: string | null;
  signerCount: number | null;
  threshold: number | null;
  /**
   * True when the on-chain step could not run (no endpoint for the chain, RPC
   * down). Kept separate from the label so the report can say "not checked"
   * rather than implying we looked and found a personal wallet.
   */
  onChainUnavailable: boolean;
}

/** Space membership changes; bytecode does not. One week is the compromise. */
export const ADDRESS_LABEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Below this, "recurring participant" would be a generous word for two votes. */
export const RECURRING_VOTE_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Snapshot space lists
// ---------------------------------------------------------------------------

export interface SpaceRoster {
  /** address -> treasury name */
  treasuries: Map<string, string>;
  /** address -> which role list it appeared in */
  controlled: Map<string, 'admin' | 'member' | 'moderator'>;
  /** False when the space could not be read at all. */
  available: boolean;
}

const EMPTY_ROSTER: SpaceRoster = {
  treasuries: new Map(),
  controlled: new Map(),
  available: false,
};

function lower(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Reads the space's own declaration of which addresses are DAO-controlled.
 *
 * An empty list and an unreachable hub are NOT the same thing, hence
 * `available`: plenty of spaces simply never fill these in, and an absent list
 * must read as "unknown", never as "this address is definitely not the DAO's".
 */
export async function fetchSpaceRoster(snapshotSpaceId: string | null): Promise<SpaceRoster> {
  if (!snapshotSpaceId) return EMPTY_ROSTER;

  try {
    const res = await snapshotRequest<{ space: SnapshotSpace | null }>(SPACE_QUERY, {
      id: snapshotSpaceId,
    });
    const space = res?.space;
    if (!space) return EMPTY_ROSTER;

    const treasuries = new Map<string, string>();
    for (const t of space.treasuries ?? []) {
      const address = lower(t?.address);
      if (address) treasuries.set(address, t?.name?.trim() || 'unnamed treasury');
    }

    const controlled = new Map<string, 'admin' | 'member' | 'moderator'>();
    // Admin outranks moderator outranks member, so seed in reverse and let the
    // stronger role overwrite.
    for (const a of space.members ?? []) {
      const address = lower(a);
      if (address) controlled.set(address, 'member');
    }
    for (const a of space.moderators ?? []) {
      const address = lower(a);
      if (address) controlled.set(address, 'moderator');
    }
    for (const a of space.admins ?? []) {
      const address = lower(a);
      if (address) controlled.set(address, 'admin');
    }

    return { treasuries, controlled, available: true };
  } catch (err) {
    console.warn(`[address-identity] space roster fetch failed for ${snapshotSpaceId}:`, err);
    return EMPTY_ROSTER;
  }
}

// ---------------------------------------------------------------------------
// The ladder (pure)
// ---------------------------------------------------------------------------

export interface IdentityInputs {
  address: string;
  roster: SpaceRoster;
  /** From `delegates` — non-null only when the address has a public identity. */
  delegateName: string | null;
  /** Votes cast by this address in this DAO. */
  voteCount: number;
  /** `null` means the chain could not be reached — not "no code". */
  onChain: Awaited<ReturnType<typeof classifyOnChainAccount>>;
}

const ROLE_WORD: Record<'admin' | 'member' | 'moderator', string> = {
  admin: 'admin',
  member: 'member',
  moderator: 'moderator',
};

/**
 * Applies the evidence ladder. Pure, so the ordering is unit-testable without
 * a network or a database.
 *
 * Ordering rationale: what the DAO says about itself beats what the chain
 * shows, which beats what we inferred from our own vote history. A treasury
 * that is also a multisig is reported as a treasury — the stronger fact.
 */
export function resolveIdentity(input: IdentityInputs): AddressIdentity {
  const address = input.address.toLowerCase();
  const base = {
    address,
    signerCount: null,
    threshold: null,
    onChainUnavailable: input.onChain === null,
  };

  const treasuryName = input.roster.treasuries.get(address);
  if (treasuryName) {
    return {
      ...base,
      label: 'dao_treasury',
      source: 'snapshot_space',
      sourceDetail: `${treasuryName} — listed as a DAO treasury in the space's own settings`,
    };
  }

  const role = input.roster.controlled.get(address);
  if (role) {
    return {
      ...base,
      label: 'dao_controlled',
      source: 'snapshot_space',
      sourceDetail: `Listed as a Snapshot space ${ROLE_WORD[role]} by the DAO itself`,
    };
  }

  if (input.delegateName) {
    return {
      ...base,
      label: 'identified_delegate',
      source: 'delegate_registry',
      sourceDetail: `Publicly identified as ${input.delegateName}`,
    };
  }

  if (input.onChain?.kind === 'multisig') {
    const { signerCount, threshold } = input.onChain;
    const shape =
      threshold !== null && signerCount !== null
        ? `${threshold}-of-${signerCount} multisig`
        : signerCount !== null
          ? `multisig with ${signerCount} signers`
          : 'multisig';
    return {
      ...base,
      label: 'multisig',
      source: 'onchain',
      sourceDetail: `On-chain: ${shape} — decisions here need more than one signer`,
      signerCount,
      threshold,
    };
  }

  if (input.onChain?.kind === 'contract') {
    return {
      ...base,
      label: 'contract',
      source: 'onchain',
      sourceDetail: 'On-chain: a smart contract, not an individual wallet',
    };
  }

  if (input.voteCount >= RECURRING_VOTE_THRESHOLD) {
    return {
      ...base,
      label: 'recurring_participant',
      source: 'vote_history',
      sourceDetail: `${input.voteCount} votes cast in this DAO, but no public identity`,
    };
  }

  return {
    ...base,
    label: 'unidentified',
    source: 'none',
    sourceDetail:
      input.onChain?.kind === 'eoa'
        ? 'An individual wallet: not a contract, not a delegate, and not among the addresses the DAO declares as its own'
        : 'No public identity, and not among the addresses the DAO declares as its own',
  };
}

/** One-line rendering for the report. Pure. */
export function formatIdentity(identity: AddressIdentity): string {
  const headline: Record<AddressLabel, string> = {
    dao_treasury: '🏛️ DAO treasury',
    dao_controlled: '🏛️ DAO-controlled address',
    identified_delegate: '🎖️ Publicly identified delegate',
    multisig:
      identity.threshold !== null && identity.signerCount !== null
        ? `🔐 Multisig (${identity.threshold} of ${identity.signerCount})`
        : '🔐 Multisig',
    contract: '📄 Smart contract',
    recurring_participant: '🔁 Recurring participant',
    unidentified: '❓ Unidentified wallet',
  };

  const detail = identity.sourceDetail ? ` — ${identity.sourceDetail}` : '';
  const caveat = identity.onChainUnavailable
    ? ' _(on-chain check unavailable for this network)_'
    : '';
  return `${headline[identity.label]}${detail}.${caveat}`;
}

// ---------------------------------------------------------------------------
// Fetch + cache
// ---------------------------------------------------------------------------

function toIdentity(row: {
  address: string;
  label: string;
  source: string;
  sourceDetail: string | null;
  signerCount: number | null;
  threshold: number | null;
}): AddressIdentity {
  return {
    address: row.address,
    label: row.label as AddressLabel,
    source: row.source as AddressLabelSource,
    sourceDetail: row.sourceDetail,
    signerCount: row.signerCount,
    threshold: row.threshold,
    // A cached row was written from a successful classification; the caveat is
    // only meaningful at resolve time.
    onChainUnavailable: false,
  };
}

/**
 * Identities for a set of addresses, reading through a cache.
 *
 * Fresh rows are served from `address_labels`; stale or missing ones are
 * resolved and written back. The Snapshot roster is fetched once per call, not
 * once per address, and only when something actually needs resolving.
 *
 * Never throws: any failure downgrades an address to `unidentified` rather
 * than failing the report.
 */
export async function fetchAddressIdentities(
  daoId: string,
  chain: string | null,
  snapshotSpaceId: string | null,
  addresses: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, AddressIdentity>> {
  const wanted = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  const result = new Map<string, AddressIdentity>();
  if (wanted.length === 0) return result;

  const cutoff = new Date(now.getTime() - ADDRESS_LABEL_TTL_MS);

  let cached: Array<{
    address: string;
    label: string;
    source: string;
    sourceDetail: string | null;
    signerCount: number | null;
    threshold: number | null;
  }> = [];
  try {
    cached = await db
      .select({
        address: addressLabels.address,
        label: addressLabels.label,
        source: addressLabels.source,
        sourceDetail: addressLabels.sourceDetail,
        signerCount: addressLabels.signerCount,
        threshold: addressLabels.threshold,
      })
      .from(addressLabels)
      .where(
        and(
          eq(addressLabels.daoId, daoId),
          inArray(addressLabels.address, wanted),
          sql`${addressLabels.checkedAt} > ${cutoff}`,
        ),
      );
  } catch (err) {
    console.warn('[address-identity] cache read failed, resolving everything fresh:', err);
  }

  for (const row of cached) result.set(row.address, toIdentity(row));

  const missing = wanted.filter((a) => !result.has(a));
  if (missing.length === 0) return result;

  const [roster, delegateRows, voteCounts] = await Promise.all([
    fetchSpaceRoster(snapshotSpaceId),
    db
      .select({ address: delegates.address, name: delegates.name, ensName: delegates.ensName })
      .from(delegates)
      .where(inArray(delegates.address, missing))
      .catch(() => []),
    db
      .select({ voter: votes.voterAddress, n: sql<number>`count(*)::int` })
      .from(votes)
      .where(and(eq(votes.daoId, daoId), inArray(votes.voterAddress, missing)))
      .groupBy(votes.voterAddress)
      .catch(() => []),
  ]);

  const delegateNames = new Map<string, string>();
  for (const d of delegateRows) {
    // Same rule as whale-context's `isPubliclyIdentified`: a bare row in
    // `delegates` proves nothing, because rebuildDelegateProfiles materialises
    // one for every frequent voter. Only an ENS or display name is identity.
    const name = d.ensName?.trim() || d.name?.trim();
    if (name) delegateNames.set(d.address.toLowerCase(), name);
  }

  const voteCountByAddress = new Map<string, number>();
  for (const v of voteCounts) voteCountByAddress.set(v.voter.toLowerCase(), Number(v.n));

  const resolved: AddressIdentity[] = [];
  for (const address of missing) {
    // Sequential rather than parallel: these are public keyless endpoints and
    // a report with a dozen whales should not open a dozen sockets at once.
    // Skipped entirely when the space already identified the address, which is
    // both stronger evidence and free.
    const needsChain =
      !roster.treasuries.has(address) &&
      !roster.controlled.has(address) &&
      !delegateNames.has(address);

    const onChain = needsChain ? await classifyOnChainAccount(address, chain) : null;

    const identity = resolveIdentity({
      address,
      roster,
      delegateName: delegateNames.get(address) ?? null,
      voteCount: voteCountByAddress.get(address) ?? 0,
      onChain,
    });
    resolved.push(identity);
    result.set(address, identity);
  }

  await persistIdentities(daoId, resolved, now);
  return result;
}

async function persistIdentities(
  daoId: string,
  identities: readonly AddressIdentity[],
  now: Date,
): Promise<void> {
  if (identities.length === 0) return;
  try {
    await db
      .insert(addressLabels)
      .values(
        identities.map((i) => ({
          daoId,
          address: i.address,
          label: i.label,
          source: i.source,
          sourceDetail: i.sourceDetail,
          signerCount: i.signerCount,
          threshold: i.threshold,
          checkedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [addressLabels.daoId, addressLabels.address],
        set: {
          label: sql`excluded.label`,
          source: sql`excluded.source`,
          sourceDetail: sql`excluded.source_detail`,
          signerCount: sql`excluded.signer_count`,
          threshold: sql`excluded.threshold`,
          checkedAt: sql`excluded.checked_at`,
        },
      });
  } catch (err) {
    // A cache that cannot be written still returns correct answers; it just
    // costs more next time. Not worth failing a report over.
    console.warn('[address-identity] cache write failed:', err);
  }
}
