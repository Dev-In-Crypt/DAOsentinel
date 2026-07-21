/**
 * Governance Atom feed — see docs/specs/governance-rss-feed.md.
 *
 * Pure XML-templating, no I/O. Hand-rolled rather than pulling in a feed
 * library — the Atom subset we need (id/title/summary/link/updated per
 * entry) is small and well-defined enough not to warrant a dependency,
 * same reasoning as the ICS calendar spec.
 */

export interface FeedEntry {
  id: string;
  title: string;
  summary: string;
  link: string;
  updated: Date;
}

/** Escapes the five XML predefined entities. Applied to every text node. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Renders an Atom 1.0 feed. Entry `id` must be a stable, unique tag URI
 * (or any consistent URI) across regenerations — readers use it to
 * de-duplicate, so an unstable id shows the same alert as "new" on every
 * poll.
 */
export function toAtomFeed(entries: FeedEntry[], feedTitle: string, feedUrl: string): string {
  const updated = entries.length > 0 ? entries[0].updated : new Date(0);
  const entryXml = entries
    .map(
      (e) => `  <entry>
    <id>${escapeXml(e.id)}</id>
    <title>${escapeXml(e.title)}</title>
    <summary>${escapeXml(e.summary)}</summary>
    <link href="${escapeXml(e.link)}"/>
    <updated>${e.updated.toISOString()}</updated>
  </entry>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feedTitle)}</title>
  <link href="${escapeXml(feedUrl)}" rel="self"/>
  <id>${escapeXml(feedUrl)}</id>
  <updated>${updated.toISOString()}</updated>
${entryXml}
</feed>
`;
}
