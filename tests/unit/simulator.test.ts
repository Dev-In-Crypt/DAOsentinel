import { describe, it, expect } from 'vitest';
import { simulateProposal, type SimulatorProposal } from '@/server/services/simulator';

function proposal(overrides: Partial<SimulatorProposal> = {}): SimulatorProposal {
  return {
    proposalId: 'p1',
    title: 'Test proposal',
    choices: ['For', 'Against'],
    quorum: null,
    votes: [],
    ...overrides,
  };
}

describe('simulateProposal', () => {
  it('flips the outcome when hypothetical VP is enough to overtake the leader', () => {
    const p = proposal({
      votes: [
        { voterAddress: '0xa', choice: 1, votingPower: 100 }, // For leads
        { voterAddress: '0xb', choice: 2, votingPower: 40 }, // Against runner-up
      ],
    });
    const result = simulateProposal(p, 70); // 40+70=110 > 100
    expect(result.originalLeader).toBe(0); // "For"
    expect(result.newLeader).toBe(1); // "Against" now leads
    expect(result.wouldHaveSwungOutcome).toBe(true);
  });

  it('does not flip the outcome when hypothetical VP is not enough', () => {
    const p = proposal({
      votes: [
        { voterAddress: '0xa', choice: 1, votingPower: 100 },
        { voterAddress: '0xb', choice: 2, votingPower: 40 },
      ],
    });
    const result = simulateProposal(p, 10); // 40+10=50 < 100
    expect(result.wouldHaveSwungOutcome).toBe(false);
    expect(result.originalLeader).toBe(result.newLeader);
  });

  it('excludes the given voter before tallying (excludeVoter)', () => {
    const p = proposal({
      votes: [
        { voterAddress: '0xWHALE', choice: 1, votingPower: 1000 }, // dominant "For" vote
        { voterAddress: '0xb', choice: 2, votingPower: 40 },
      ],
    });
    // Without exclusion, For dominates and no reasonable VP flips it.
    const withWhale = simulateProposal(p, 70);
    expect(withWhale.wouldHaveSwungOutcome).toBe(false);

    // Excluding the whale's vote leaves Against as the sole real vote,
    // then boosting the (now-leading) Against choice can't "swing" it
    // since it's already leading — but the exclusion itself must change
    // the leader computation. Verify by checking originalLeader flips.
    const withoutWhale = simulateProposal(p, 70, '0xwhale'); // case-insensitive
    expect(withoutWhale.originalLeader).toBe(1); // Against leads once whale is excluded
  });

  it('is case-insensitive when matching excludeVoter', () => {
    // Single voter on the non-default choice (index 1), so exclusion vs.
    // no-exclusion produce visibly different leaders — a stronger check
    // than one where both paths happen to land on the same default index.
    const p = proposal({
      votes: [{ voterAddress: '0xABC', choice: 2, votingPower: 50 }],
    });
    const notExcluded = simulateProposal(p, 10, '0xdead');
    expect(notExcluded.originalLeader).toBe(1); // the only vote, for "Against"

    const excluded = simulateProposal(p, 10, '0xabc'); // lowercase, matches 0xABC
    expect(excluded.originalLeader).toBe(0); // vote removed → falls back to index 0
  });

  it('reports wouldHaveMetQuorum only when originally missed and hypothetical VP pushes it over', () => {
    const p = proposal({
      quorum: 100,
      votes: [{ voterAddress: '0xa', choice: 1, votingPower: 60 }],
    });
    expect(simulateProposal(p, 50).wouldHaveMetQuorum).toBe(true); // 60+50=110 >= 100
    expect(simulateProposal(p, 20).wouldHaveMetQuorum).toBe(false); // 60+20=80 < 100
  });

  it('reports wouldHaveMetQuorum=false when quorum was already met (not newly met)', () => {
    const p = proposal({
      quorum: 50,
      votes: [{ voterAddress: '0xa', choice: 1, votingPower: 60 }], // already >= 50
    });
    expect(simulateProposal(p, 1000).wouldHaveMetQuorum).toBe(false);
  });

  it('reports wouldHaveMetQuorum=false when the proposal has no quorum requirement', () => {
    const p = proposal({ quorum: null, votes: [] });
    expect(simulateProposal(p, 1000).wouldHaveMetQuorum).toBe(false);
  });

  it('cannot swing a single-choice proposal (nothing to swing to)', () => {
    const p = proposal({
      choices: ['Approve'],
      votes: [{ voterAddress: '0xa', choice: 1, votingPower: 10 }],
    });
    const result = simulateProposal(p, 99999);
    expect(result.originalLeader).toBe(result.newLeader);
    expect(result.wouldHaveSwungOutcome).toBe(false);
  });

  it('handles a proposal with zero votes — hypothetical VP becomes the only voter', () => {
    const p = proposal({ votes: [] });
    const result = simulateProposal(p, 50);
    // Leader over zero votes defaults to index 0; the hypothetical VP is
    // boosted onto the runner-up (index 1), which then leads once it has
    // the only non-zero tally.
    expect(result.originalLeader).toBe(0);
    expect(result.newLeader).toBe(1);
    expect(result.wouldHaveSwungOutcome).toBe(true);
  });
});
