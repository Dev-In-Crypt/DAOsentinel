import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../scripts/deactivate-org';

const VALID_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('deactivate-org parseArgs', () => {
  it('parses a valid --org-id', () => {
    const args = parseArgs(['--org-id', VALID_ID]);
    expect(args.orgId).toBe(VALID_ID);
    expect(args.reason).toBeUndefined();
  });

  it('parses an optional --reason', () => {
    const args = parseArgs(['--org-id', VALID_ID, '--reason', 'did not renew']);
    expect(args.reason).toBe('did not renew');
  });

  it('rejects a missing --org-id', () => {
    expect(() => parseArgs([])).toThrow(/Missing required flag: --org-id/);
  });

  it('rejects a malformed --org-id', () => {
    expect(() => parseArgs(['--org-id', 'not-a-uuid'])).toThrow(/not a valid UUID/);
  });
});
