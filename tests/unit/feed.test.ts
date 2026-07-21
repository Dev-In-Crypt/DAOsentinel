import { describe, it, expect } from 'vitest';
import { toAtomFeed, type FeedEntry } from '@/lib/feed';

function entry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: 'tag:daosentinel.xyz,2026:alert-1',
    title: 'Whale vote on Uniswap',
    summary: 'Address 0x1234 cast a large vote.',
    link: 'https://www.daosentinel.xyz/proposals/1',
    updated: new Date('2026-07-21T12:00:00Z'),
    ...overrides,
  };
}

describe('toAtomFeed', () => {
  it('produces a well-formed Atom feed with the correct root elements', () => {
    const xml = toAtomFeed([entry()], 'DAO Sentinel — Alerts', 'https://www.daosentinel.xyz/api/feed/alerts.xml');
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('<title>DAO Sentinel — Alerts</title>');
    expect(xml).toContain('<link href="https://www.daosentinel.xyz/api/feed/alerts.xml" rel="self"/>');
    expect(xml).toContain('</feed>');
  });

  it('renders one <entry> per feed entry with all required fields', () => {
    const xml = toAtomFeed(
      [entry({ id: 'a1' }), entry({ id: 'a2', title: 'Quorum risk on Aave' })],
      'Feed',
      'https://example.com/feed.xml',
    );
    const entryCount = (xml.match(/<entry>/g) ?? []).length;
    expect(entryCount).toBe(2);
    expect(xml).toContain('<id>a1</id>');
    expect(xml).toContain('<id>a2</id>');
    expect(xml).toContain('Quorum risk on Aave');
  });

  it('escapes XML-significant characters in title, summary, and link', () => {
    const xml = toAtomFeed(
      [
        entry({
          title: 'A & B <flip> "outcome"',
          summary: "It's <risky> & 'weird'",
          link: 'https://example.com/x?a=1&b=2',
        }),
      ],
      'Feed & Title',
      'https://example.com/feed.xml',
    );
    expect(xml).not.toContain('A & B <flip>');
    expect(xml).toContain('A &amp; B &lt;flip&gt; &quot;outcome&quot;');
    expect(xml).toContain('It&apos;s &lt;risky&gt; &amp; &apos;weird&apos;');
    expect(xml).toContain('href="https://example.com/x?a=1&amp;b=2"');
    expect(xml).toContain('<title>Feed &amp; Title</title>');
  });

  it('produces stable entry ids across repeated calls with the same input (no reader-side duplicates)', () => {
    const e = entry();
    const first = toAtomFeed([e], 'F', 'https://example.com/f.xml');
    const second = toAtomFeed([e], 'F', 'https://example.com/f.xml');
    expect(first).toBe(second);
  });

  it('renders a valid empty feed (no entries) without throwing', () => {
    const xml = toAtomFeed([], 'Empty Feed', 'https://example.com/empty.xml');
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).not.toContain('<entry>');
    expect(xml).toContain('</feed>');
  });

  it('uses the epoch as <updated> for an empty feed and the first entry date otherwise', () => {
    const empty = toAtomFeed([], 'F', 'https://example.com/f.xml');
    expect(empty).toContain('<updated>1970-01-01T00:00:00.000Z</updated>');

    const withEntries = toAtomFeed(
      [entry({ updated: new Date('2026-07-21T12:00:00Z') })],
      'F',
      'https://example.com/f.xml',
    );
    expect(withEntries).toContain('<updated>2026-07-21T12:00:00.000Z</updated>');
  });
});
