# Spec · Governance RSS/Atom feed

> New idea (not yet on the public roadmap page). Doc-only — no code in
> this pass. Downstream: TODO-031 (single implementation task).

## The problem

Governance news today mostly circulates as scattered Twitter/X threads —
hard to aggregate programmatically. There's no standard, subscribable
feed of "what happened in DAO governance this week/hour" that plugs into
the tools people already use (Feedly, Zapier, IFTTT, a personal RSS
reader, a Slack RSS-to-channel integration) without needing our API key
or building a custom integration.

## Why this, why now

- Practically free to build: we already have `alerts` rows with
  `title`/`description`/`createdAt`/`daoId`, and the real-time SSE feed
  (`/api/alerts/stream`) already proves the query pattern. RSS is a
  read-only, cacheable rendering of data we already serve.
- Uniquely low-friction distribution: no API key, no webhook setup, no
  account — paste a URL into any RSS reader.

## Scope

- `/api/feed/alerts.xml` — global feed, most recent N alerts across all
  DAOs (Atom or RSS 2.0 — Atom is slightly cleaner for this; either is
  fine, pick one and be consistent).
- `/api/feed/dao/[slug].xml` — per-DAO feed, same shape scoped to one DAO.
- Optional query param `?severity=warning,critical` to exclude `info`-level
  noise (mirrors the existing `/alerts` page's filter UX).
- **Out of scope:** per-user personalized feed (that's better served by
  the ICS/watchlist spec's token pattern if ever needed) — this is
  explicitly public, DAO-scoped or global content, no auth.

## Data model impact

None. Read-only over the existing `alerts` + `daos` tables, same query
shape already used by `/alerts` page and `/api/v1/alerts`.

## Implementation (TODO-031)

```ts
// src/lib/feed.ts — pure formatter, no I/O
function toAtomFeed(entries: Array<{
  id: string; title: string; summary: string; link: string; updated: Date;
}>, feedTitle: string, feedUrl: string): string
```

- One pure XML-templating function (Atom spec is simple enough not to
  need a dependency — same reasoning as the ICS spec: hand-rolled string
  templating for a well-defined, narrow subset of a text format).
- Two thin route handlers reusing the exact query already in
  `src/app/(app)/alerts/page.tsx` (global + `type`/`severity` filtered),
  returning `Content-Type: application/atom+xml; charset=utf-8`.
- Cache with a short `revalidate` (e.g. 5 minutes) — this is public,
  identical-for-everyone content, a good fit for the ISR pattern already
  used elsewhere (see `VERIFY.md`'s dead-DB prerender guard notes for
  why `dynamic`/`revalidate` choices need care on DB-backed routes —
  this route is a Route Handler, not a page, so the same prerender
  concern doesn't apply the same way, but cache headers should still be
  set deliberately).

## UI impact

- Small RSS icon/link in the footer or on `/alerts`, pointing at the feed
  URL — most RSS consumers just need the raw URL, no custom UI required.
- Mention in `/docs` alongside the existing Open API section.

## Security / reliability risks

- Purely additive, read-only, no new data exposed beyond what
  `/alerts` and `/api/v1/alerts` already serve publicly.
- No rate-limiting concern beyond existing public-GET patterns — RSS
  readers typically poll every 15-60 minutes.

## Verification plan

- `npm test` — `toAtomFeed()` pure formatter tested against fixture alert
  rows (valid Atom XML structure, stable entry IDs so readers don't
  show duplicates on every poll).
- `npm run build` + manual validation: run the generated feed URL through
  a standard feed validator (e.g. the W3C feed validator) to confirm
  real-world reader compatibility, not just "looks like XML."
