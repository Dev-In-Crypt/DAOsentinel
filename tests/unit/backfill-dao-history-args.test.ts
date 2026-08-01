import { describe, expect, it } from 'vitest';
import { DEFAULT_VOTE_BACKFILL, parseArgs } from '../../scripts/backfill-dao-history';

/**
 * Same discipline as activate-org / deactivate-org: the CLI surface is parsed
 * by an exported pure function so it can be tested without touching Snapshot or
 * the database, and the script guards its own entrypoint so importing it here
 * does not run `main()`.
 */

describe('backfill-dao-history parseArgs', () => {
  it('parses a slug and defaults the vote window', () => {
    const args = parseArgs(['--slug', 'shutter']);
    expect(args.slug).toBe('shutter');
    expect(args.voteBackfill).toBe(DEFAULT_VOTE_BACKFILL);
  });

  it('requires --slug', () => {
    expect(() => parseArgs([])).toThrow(/Missing required flag: --slug/);
  });

  it('accepts an explicit vote window', () => {
    expect(parseArgs(['--slug', 'ens', '--votes', '40']).voteBackfill).toBe(40);
  });

  it('treats --no-votes as a zero window', () => {
    expect(parseArgs(['--slug', 'ens', '--no-votes']).voteBackfill).toBe(0);
  });

  it('rejects --no-votes combined with --votes', () => {
    expect(() => parseArgs(['--slug', 'ens', '--no-votes', '--votes', '10'])).toThrow(
      /mutually exclusive/,
    );
  });

  it('rejects a non-integer or negative vote window', () => {
    expect(() => parseArgs(['--slug', 'ens', '--votes', 'lots'])).toThrow(/non-negative integer/);
    expect(() => parseArgs(['--slug', 'ens', '--votes', '-3'])).toThrow(/non-negative integer/);
    expect(() => parseArgs(['--slug', 'ens', '--votes', '2.5'])).toThrow(/non-negative integer/);
  });

  it('accepts an explicit zero, which is the same as --no-votes', () => {
    expect(parseArgs(['--slug', 'ens', '--votes', '0']).voteBackfill).toBe(0);
  });
});
