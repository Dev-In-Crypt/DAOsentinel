import { describe, it, expect } from 'vitest';
import { mapTallyState, tallyTsToDate, deriveTallyTitle } from '@/lib/tally-client';

describe('mapTallyState', () => {
  it('maps ACTIVE → active and PENDING → pending', () => {
    expect(mapTallyState('ACTIVE')).toBe('active');
    expect(mapTallyState('PENDING')).toBe('pending');
  });

  it('is case-insensitive', () => {
    expect(mapTallyState('active')).toBe('active');
    expect(mapTallyState('pending')).toBe('pending');
  });

  it('maps every terminal Governor state to closed', () => {
    for (const s of ['DEFEATED', 'EXECUTED', 'CANCELED', 'QUEUED', 'SUCCEEDED', 'EXPIRED']) {
      expect(mapTallyState(s), s).toBe('closed');
    }
  });

  it('defaults unknown states to closed', () => {
    expect(mapTallyState('SOMETHING_NEW')).toBe('closed');
    expect(mapTallyState('')).toBe('closed');
  });
});

describe('tallyTsToDate', () => {
  it('returns null for empty/nullish/non-numeric/non-positive input', () => {
    expect(tallyTsToDate(null)).toBeNull();
    expect(tallyTsToDate(undefined)).toBeNull();
    expect(tallyTsToDate('')).toBeNull();
    expect(tallyTsToDate('not-a-number')).toBeNull();
    expect(tallyTsToDate('0')).toBeNull();
    expect(tallyTsToDate('-5')).toBeNull();
  });

  it('treats a seconds timestamp (< 1e12) as seconds and converts to ms', () => {
    const secs = 1_700_000_000; // ~2023-11-14
    expect(tallyTsToDate(String(secs))?.getTime()).toBe(secs * 1000);
  });

  it('treats a millisecond timestamp (>= 1e12) as already-ms', () => {
    const ms = 1_700_000_000_000;
    expect(tallyTsToDate(String(ms))?.getTime()).toBe(ms);
  });
});

describe('deriveTallyTitle', () => {
  it('keeps a real title as-is', () => {
    expect(deriveTallyTitle('Adopt the SEAL Safe Harbor', 'body', 'Compound', '1')).toBe(
      'Adopt the SEAL Safe Harbor',
    );
  });

  it('replaces stub titles (0x0 / "Proposal" / untitled / too short / empty)', () => {
    const desc = 'Increase the supply cap for rsETH on Mainnet';
    for (const stub of ['0x0', '0xdeadbeef', 'Proposal', 'untitled', 'abc', '', '   ']) {
      expect(deriveTallyTitle(stub, desc, 'Compound', '42'), stub).toBe(desc);
    }
  });

  it('strips markdown/leading noise and picks the first meaningful description line', () => {
    const body = '#  \n> \nSupply cap recommendations for rsETH on USDC comets';
    expect(deriveTallyTitle('0x0', body, 'Compound', '42')).toBe(
      'Supply cap recommendations for rsETH on USDC comets',
    );
  });

  it('falls back to "{DAO} proposal #{id}" when stub title has no usable description', () => {
    expect(deriveTallyTitle('0x0', null, 'Compound', '99')).toBe('Compound proposal #99');
    expect(deriveTallyTitle('0x0', 'short', 'Uniswap', '7')).toBe('Uniswap proposal #7');
  });

  it('truncates to 500 chars', () => {
    const long = 'Real Title ' + 'x'.repeat(600);
    expect(deriveTallyTitle(long, null, 'Aave', '1').length).toBe(500);
  });
});
