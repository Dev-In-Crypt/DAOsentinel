import { describe, it, expect } from 'vitest';
import { renderOrgReport } from '@/server/email/render';
import type { OrgReportEmailProps } from '@/emails/OrgReportEmail';

const BODY = `# DAO Sentinel Weekly — 2026-07-27

## 📰 Top stories
- **Fee switch activation** (Uniswap) — 412 votes, closed
- **Treasury diversification** (Uniswap) — 88 votes, active

## 🐳 Whale activity
_No whale votes this week._

## 🗒️ Concierge notes
- **[proposal]** Fee switch activation — worth a call before Friday.`;

function props(overrides: Partial<OrgReportEmailProps> = {}): OrgReportEmailProps {
  return {
    organizationId: 'org-1',
    organizationName: 'Acme Capital LLC',
    daoName: 'Uniswap',
    daoSlug: 'uniswap',
    weekOf: '7/27/2026',
    markdownBody: BODY,
    ...overrides,
  };
}

describe('OrgReportEmail', () => {
  it('heads the report with brandingDisplayName and the DAO name', async () => {
    const html = await renderOrgReport(props({ brandingDisplayName: 'Acme Governance' }));
    expect(html).toContain('Acme Governance');
    expect(html).toContain('Uniswap');
    // The branding name wins over the raw org name in the header.
    expect(html).not.toContain('Acme Capital LLC');
  });

  it('falls back to the organization name when brandingDisplayName is absent', async () => {
    const absent = await renderOrgReport(props());
    expect(absent).toContain('Acme Capital LLC');

    const nulled = await renderOrgReport(props({ brandingDisplayName: null }));
    expect(nulled).toContain('Acme Capital LLC');
  });

  it('never sends a paying member to the public /digest archive', async () => {
    const html = await renderOrgReport(props());
    expect(html).not.toContain('daosentinel.xyz/digest');
    expect(html).not.toMatch(/web version with charts/i);
  });

  it('never offers the public newsletter unsubscribe', async () => {
    const html = await renderOrgReport(props());
    expect(html).not.toContain('/unsubscribe');
    expect(html).not.toMatch(/unsubscribe/i);
    expect(html).not.toMatch(/don't want these/i);
    // ...and says something true instead: membership is the delivery mechanism.
    expect(html).toMatch(/member of/i);
    expect(html).toMatch(/account manager/i);
  });

  it("links only to the org's own dashboard route", async () => {
    const html = await renderOrgReport(props());
    expect(html).toContain('/org/org-1/uniswap');
  });

  it('renders the report body content', async () => {
    const html = await renderOrgReport(props());
    expect(html).toContain('Fee switch activation');
    expect(html).toContain('Treasury diversification');
    expect(html).toContain('worth a call before Friday');
  });

  it('renders the markdown subset as real HTML, not literal punctuation', async () => {
    const html = await renderOrgReport(props());
    expect(html).toContain('<strong>Fee switch activation</strong>');
    expect(html).toContain('<li');
    expect(html).toContain('<em>No whale votes this week.</em>');
    // No leftover markdown tokens from the parsed constructs.
    expect(html).not.toContain('## 📰 Top stories');
    expect(html).not.toContain('**Fee switch activation**');
  });

  it('escapes HTML-looking content in the body instead of emitting markup', async () => {
    const hostile = [
      '## Notes',
      '- <script>alert(1)</script> and <img src=x onerror=alert(2)>',
      '- **<b>bold tag</b>** in a bullet',
      'A paragraph with <iframe src="evil"></iframe>.',
    ].join('\n');
    const html = await renderOrgReport(props({ markdownBody: hostile }));

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>bold tag</b>');
    // The characters survive as visible, escaped text — including the event
    // handler, which is inert once `<` and `>` are entities.
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('&lt;iframe src=&quot;evil&quot;&gt;');
    // The surrounding markdown still formats normally.
    expect(html).toContain('<strong>&lt;b&gt;bold tag&lt;/b&gt;</strong>');
  });

  it('uses a valid brandingPrimaryColor as the accent, re-emitted as hsl()', async () => {
    const html = await renderOrgReport(props({ brandingPrimaryColor: '#4f46e5' }));
    // #4f46e5 -> hsl(243, 75%, 59%). Never the raw stored string.
    expect(html).toContain('color:hsl(243, 75%, 59%)');
  });

  it('ignores a malformed brandingPrimaryColor without breaking or injecting', async () => {
    const malformed = [
      'not-a-color',
      'red; } body { display:none } .x{',
      '"><script>alert(1)</script>',
      '#12345',
      '',
    ];
    for (const brandingPrimaryColor of malformed) {
      const html = await renderOrgReport(props({ brandingPrimaryColor }));
      // Falls back to the brand green rather than emitting the stored value.
      expect(html).toContain('color:#22c55e');
      if (brandingPrimaryColor !== '') expect(html).not.toContain(brandingPrimaryColor);
      expect(html).not.toContain('<script>');
      // The mail still renders in full.
      expect(html).toContain('Acme Capital LLC');
      expect(html).toContain('Fee switch activation');
    }
  });

  it('only renders an http(s) branding logo', async () => {
    const ok = await renderOrgReport(props({ brandingLogoUrl: 'https://cdn.example.com/l.png' }));
    expect(ok).toContain('https://cdn.example.com/l.png');

    const bad = await renderOrgReport(props({ brandingLogoUrl: 'javascript:alert(1)' }));
    expect(bad).not.toContain('javascript:alert(1)');
  });
});
