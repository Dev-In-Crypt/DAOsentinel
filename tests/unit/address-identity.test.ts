import { describe, it, expect } from 'vitest';
import {
  formatIdentity,
  resolveIdentity,
  RECURRING_VOTE_THRESHOLD,
  type SpaceRoster,
} from '@/server/services/org-report/address-identity';

/**
 * TODO-074. Pure layer only — `fetchSpaceRoster` and `fetchAddressIdentities`
 * hit Snapshot, an RPC and the database, matching the split every other module
 * in org-report/ uses.
 *
 * What these tests are really protecting is the honesty rule: a label must be
 * backed by a source, and "we could not check" must never be rendered as a
 * finding.
 */

const ADDR = '0xfe698c212526f15cc25af671beba14aac309457f';

function roster(over: Partial<SpaceRoster> = {}): SpaceRoster {
  return { treasuries: new Map(), controlled: new Map(), available: true, ...over };
}

function inputs(over: Partial<Parameters<typeof resolveIdentity>[0]> = {}) {
  return {
    address: ADDR,
    roster: roster(),
    delegateName: null,
    voteCount: 0,
    onChain: null,
    ...over,
  };
}

describe('resolveIdentity — evidence ladder', () => {
  it('puts a declared treasury above everything else', () => {
    const r = resolveIdentity(
      inputs({
        roster: roster({
          treasuries: new Map([[ADDR, 'AavegotchiDAO Treasury (Polygon)']]),
          controlled: new Map([[ADDR, 'admin']]),
        }),
        delegateName: 'someone.eth',
        onChain: { kind: 'multisig', signerCount: 3, threshold: 2 },
      }),
    );
    expect(r.label).toBe('dao_treasury');
    expect(r.source).toBe('snapshot_space');
    expect(r.sourceDetail).toContain('AavegotchiDAO Treasury (Polygon)');
  });

  it('reports a space admin as DAO-controlled, naming the role', () => {
    const r = resolveIdentity(
      inputs({ roster: roster({ controlled: new Map([[ADDR, 'admin']]) }) }),
    );
    expect(r.label).toBe('dao_controlled');
    expect(r.sourceDetail).toContain('admin');
  });

  it('prefers a public delegate identity over on-chain shape', () => {
    const r = resolveIdentity(
      inputs({
        delegateName: 'grantsguild.eth',
        onChain: { kind: 'multisig', signerCount: 5, threshold: 3 },
      }),
    );
    expect(r.label).toBe('identified_delegate');
    expect(r.sourceDetail).toContain('grantsguild.eth');
  });

  it('reports a multisig with its real N-of-M', () => {
    const r = resolveIdentity(
      inputs({ onChain: { kind: 'multisig', signerCount: 3, threshold: 2 } }),
    );
    expect(r.label).toBe('multisig');
    expect(r.signerCount).toBe(3);
    expect(r.threshold).toBe(2);
    expect(formatIdentity(r)).toContain('2 of 3');
  });

  // Aavegotchi's treasury is a legacy Gnosis MultiSigWallet: `getOwners()`
  // answers but `getThreshold()` does not, so the count is known and the
  // threshold is not. Saying "multisig" without inventing a threshold is the
  // correct output.
  it('reports a multisig with an unknown threshold without inventing one', () => {
    const r = resolveIdentity(
      inputs({ onChain: { kind: 'multisig', signerCount: 3, threshold: null } }),
    );
    expect(r.label).toBe('multisig');
    expect(r.sourceDetail).toContain('3 signers');
    expect(formatIdentity(r)).not.toMatch(/\d+ of \d+/);
  });

  it('reports a non-multisig contract as a contract', () => {
    const r = resolveIdentity(
      inputs({ onChain: { kind: 'contract', signerCount: null, threshold: null } }),
    );
    expect(r.label).toBe('contract');
  });

  it('falls back to recurring participant at the threshold', () => {
    const r = resolveIdentity(
      inputs({
        voteCount: RECURRING_VOTE_THRESHOLD,
        onChain: { kind: 'eoa', signerCount: null, threshold: null },
      }),
    );
    expect(r.label).toBe('recurring_participant');
    expect(r.sourceDetail).toContain(String(RECURRING_VOTE_THRESHOLD));
  });

  it('is unidentified just below the recurring threshold', () => {
    const r = resolveIdentity(
      inputs({
        voteCount: RECURRING_VOTE_THRESHOLD - 1,
        onChain: { kind: 'eoa', signerCount: null, threshold: null },
      }),
    );
    expect(r.label).toBe('unidentified');
  });

  it('says an unidentified EOA is an individual wallet, and says so as evidence', () => {
    const r = resolveIdentity(
      inputs({ onChain: { kind: 'eoa', signerCount: null, threshold: null } }),
    );
    expect(r.label).toBe('unidentified');
    expect(r.sourceDetail).toContain('individual wallet');
    expect(r.onChainUnavailable).toBe(false);
  });
});

describe('resolveIdentity — "could not check" is not a finding', () => {
  // The distinction the whole module turns on: a chain we could not reach must
  // never read as "we looked and it is a personal wallet".
  it('flags an unreachable chain instead of claiming the address is an EOA', () => {
    const r = resolveIdentity(inputs({ onChain: null }));
    expect(r.label).toBe('unidentified');
    expect(r.onChainUnavailable).toBe(true);
    expect(r.sourceDetail).not.toContain('individual wallet');
    expect(formatIdentity(r)).toContain('on-chain check unavailable');
  });

  it('does not add the caveat when the chain answered', () => {
    const r = resolveIdentity(
      inputs({ onChain: { kind: 'eoa', signerCount: null, threshold: null } }),
    );
    expect(formatIdentity(r)).not.toContain('on-chain check unavailable');
  });

  // An empty admin list is normal — most spaces never fill one in. It must not
  // be read as proof that an address is NOT the DAO's.
  it('treats an empty roster as unknown, not as a negative finding', () => {
    const r = resolveIdentity(inputs({ roster: roster({ available: false }) }));
    expect(r.label).toBe('unidentified');
  });
});

describe('resolveIdentity — hygiene', () => {
  it('lowercases the address so lookups match', () => {
    const r = resolveIdentity(inputs({ address: ADDR.toUpperCase() }));
    expect(r.address).toBe(ADDR.toUpperCase().toLowerCase());
  });

  it('never emits a "foundation" label — we cannot establish that', () => {
    const labels = [
      resolveIdentity(inputs({ roster: roster({ treasuries: new Map([[ADDR, 'Treasury']]) }) })),
      resolveIdentity(inputs({ roster: roster({ controlled: new Map([[ADDR, 'admin']]) }) })),
      resolveIdentity(inputs({ onChain: { kind: 'multisig', signerCount: 3, threshold: 2 } })),
      resolveIdentity(inputs()),
    ].map((r) => r.label);
    expect(labels.some((l) => String(l).includes('foundation'))).toBe(false);
  });

  it('always carries a source for a positive label', () => {
    const positives = [
      resolveIdentity(inputs({ roster: roster({ treasuries: new Map([[ADDR, 'T']]) }) })),
      resolveIdentity(inputs({ roster: roster({ controlled: new Map([[ADDR, 'member']]) }) })),
      resolveIdentity(inputs({ delegateName: 'x.eth' })),
      resolveIdentity(inputs({ onChain: { kind: 'multisig', signerCount: 2, threshold: 1 } })),
    ];
    for (const r of positives) {
      expect(r.source).not.toBe('none');
      expect(r.sourceDetail).toBeTruthy();
    }
  });
});
