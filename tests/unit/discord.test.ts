import { describe, it, expect } from 'vitest';
import { isValidDiscordWebhook, sendDiscordAlert } from '@/lib/discord';

describe('isValidDiscordWebhook', () => {
  it('accepts a canonical discord.com webhook URL', () => {
    expect(
      isValidDiscordWebhook('https://discord.com/api/webhooks/123456789012345678/abcDEF-_ghi'),
    ).toBe(true);
  });

  it('accepts the legacy discordapp.com host', () => {
    expect(
      isValidDiscordWebhook('https://discordapp.com/api/webhooks/123/abcDEF_-'),
    ).toBe(true);
  });

  it('accepts canary and ptb subdomains', () => {
    expect(
      isValidDiscordWebhook('https://canary.discord.com/api/webhooks/1/tokenABC'),
    ).toBe(true);
    expect(
      isValidDiscordWebhook('https://ptb.discord.com/api/webhooks/1/tokenABC'),
    ).toBe(true);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(
      isValidDiscordWebhook('   https://discord.com/api/webhooks/1/token  '),
    ).toBe(true);
  });

  it('rejects non-Discord and malformed URLs', () => {
    const bad = [
      '',
      'not a url',
      'http://discord.com/api/webhooks/1/token', // http, not https
      'https://discord.com/api/webhook/1/token', // "webhook" singular
      'https://example.com/api/webhooks/1/token', // wrong host
      'https://discord.com/api/webhooks//token', // missing id
      'https://discord.com/api/webhooks/abc/token', // non-numeric id
      'https://evil.discord.com.attacker.com/api/webhooks/1/token', // host spoof
      'https://discord.com/api/webhooks/1/token?x=1', // trailing query
    ];
    for (const url of bad) {
      expect(isValidDiscordWebhook(url), url).toBe(false);
    }
  });
});

describe('sendDiscordAlert', () => {
  it('returns false without any network call when the URL is invalid', async () => {
    // Guard clause rejects before fetch, so this is safe offline.
    const ok = await sendDiscordAlert('not-a-webhook', {
      title: 'x',
      description: 'y',
      severity: 'warning',
    });
    expect(ok).toBe(false);
  });
});
