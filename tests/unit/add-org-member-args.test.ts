import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../scripts/add-org-member';

describe('add-org-member parseArgs', () => {
  it('parses required flags with defaults', () => {
    const args = parseArgs(['--org-id', 'org-1', '--email', 'person@acme.xyz']);
    expect(args).toEqual({ orgId: 'org-1', email: 'person@acme.xyz', role: 'member', sendEmail: true });
  });

  it('rejects missing required flags', () => {
    expect(() => parseArgs(['--org-id', 'org-1'])).toThrow(/Missing required flag/);
    expect(() => parseArgs(['--email', 'a@b.com'])).toThrow(/Missing required flag/);
  });

  it('accepts an explicit --role owner', () => {
    const args = parseArgs(['--org-id', 'org-1', '--email', 'a@b.com', '--role', 'owner']);
    expect(args.role).toBe('owner');
  });

  it('rejects an invalid --role', () => {
    expect(() =>
      parseArgs(['--org-id', 'org-1', '--email', 'a@b.com', '--role', 'admin']),
    ).toThrow(/Invalid --role/);
  });

  it('rejects a malformed email', () => {
    expect(() => parseArgs(['--org-id', 'org-1', '--email', 'not-an-email'])).toThrow(
      /does not look like a valid email/,
    );
  });

  it('--no-email sets sendEmail to false', () => {
    const args = parseArgs(['--org-id', 'org-1', '--email', 'a@b.com', '--no-email']);
    expect(args.sendEmail).toBe(false);
  });
});
