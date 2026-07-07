import { describe, it, expect } from 'vitest';
import { makeLinkToken, verifyLinkToken } from '@/lib/telegram';

const USER_ID = 'a1b2c3d4-0000-4444-8888-abcdefabcdef';

describe('telegram link token', () => {
  it('round-trips a userId through make → verify', () => {
    const token = makeLinkToken(USER_ID);
    expect(verifyLinkToken(token)).toBe(USER_ID);
  });

  it('produces a "payload.sig" shaped token', () => {
    const token = makeLinkToken(USER_ID);
    expect(token.split('.')).toHaveLength(2);
    const [payload, sig] = token.split('.');
    expect(payload.length).toBeGreaterThan(0);
    expect(sig.length).toBeGreaterThan(0);
  });

  it('gives different users different tokens', () => {
    expect(makeLinkToken('user-a')).not.toBe(makeLinkToken('user-b'));
  });

  it('rejects a token with a tampered payload', () => {
    const [, sig] = makeLinkToken(USER_ID).split('.');
    const forgedPayload = Buffer.from('attacker-id').toString('base64url');
    expect(verifyLinkToken(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it('rejects a token with a tampered signature', () => {
    const [payload] = makeLinkToken(USER_ID).split('.');
    expect(verifyLinkToken(`${payload}.deadbeefdeadbeefdead`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    for (const bad of ['', 'no-dot', '.', 'a.', '.b', 'a.b.c']) {
      expect(verifyLinkToken(bad), bad).toBeNull();
    }
  });
});
