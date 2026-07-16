# Spec · ICS calendar export for voting deadlines

> New idea (not yet on the public roadmap page). Doc-only — no code in this
> pass. Downstream: TODO-025 (single implementation task — small enough
> not to split further).

## The problem

The dashboard already has an "Upcoming deadlines" section
(`src/app/(app)/dashboard/page.tsx`), but it only exists inside our own
UI. Active delegates juggle deadlines across many DAOs and want them in
their **own calendar** (Google Calendar, Apple Calendar, Outlook) — not
another app to remember to check.

## Why this, why now

- Extremely cheap relative to its practical value: the `.ics` format is a
  plain-text spec, no new dependency needed (hand-rolled generator is
  ~40 lines), no external API, no new data — reuses the exact same query
  already powering the dashboard's upcoming-deadlines section.
- No competing governance platform offers this — a genuinely unique,
  low-effort differentiator.

## Scope

- Two flavors:
  1. **Per-DAO feed**: `/api/ics/dao/[slug].ics` — all active proposals'
     end times for one DAO. Public, no auth (matches the rest of the free
     public API surface).
  2. **Per-user watchlist feed**: `/api/ics/watchlist/[token].ics` — active
     proposals across the user's `watchedDaos`, keyed by an opaque token
     (same HMAC-link-token pattern already built for Telegram in
     `src/lib/telegram.ts` — reuse `makeLinkToken`/`verifyLinkToken`
     rather than inventing a new token scheme).
- Calendar apps poll a URL on their own schedule (typically hourly) — no
  push mechanism needed, this is a pull-only feed.
- **Out of scope:** two-way sync (nobody needs to "reply" to a governance
  deadline), push notifications via calendar (already covered by
  Email/Telegram/Discord alerts).

## Data model impact

None. Read-only over existing `proposals` (state='active', ordered by
`endTimestamp`) and `users.watchedDaos`.

## Implementation (TODO-025)

```ts
// src/lib/ics.ts — pure formatter, no I/O
function toIcs(events: Array<{ uid: string; title: string; start: Date; end: Date; url: string }>): string
```

- One pure function generates the `.ics` text body (VCALENDAR/VEVENT
  blocks per RFC 5545) — straightforward string templating, no library
  needed for this subset of the spec (no recurrence rules, no
  timezone-conversion edge cases beyond UTC, which is all we need since
  every deadline is already stored as an absolute UTC timestamp).
- Two thin route handlers (`/api/ics/dao/[slug]/route.ts`,
  `/api/ics/watchlist/[token]/route.ts`) that load the relevant proposals
  and call `toIcs()`. Both return
  `Content-Type: text/calendar; charset=utf-8`.
- Per-user token reuses `makeLinkToken(userId)` from `src/lib/telegram.ts`
  — no new secret, no new column. (If that function's name/location
  should change to reflect broader reuse beyond Telegram, that's a
  1-line rename to consider during implementation, not a blocker for the
  spec.)

## UI impact

- Small "Add to calendar" link/button on the dashboard's upcoming-deadlines
  section and on `/settings` (for the personal watchlist feed), pointing at
  the `.ics` URL (calendar apps handle `webcal://`/`https://.ics` URLs
  natively — no custom UI needed beyond a copyable link).

## Security / reliability risks

- The per-user token must not leak enough to be guessable — reusing the
  existing HMAC scheme (already reviewed for the Telegram link flow)
  avoids introducing a new, unreviewed token format.
- Public per-DAO feed exposes nothing not already public on `/daos/[slug]`.
- No rate-limiting concern beyond what already exists for public GET
  endpoints — calendar apps poll infrequently (typically hourly).

## Verification plan

- `npm test` — `toIcs()` pure formatter tested against fixture proposal
  lists (correct VEVENT count, correct UID stability across regenerations
  so calendar apps don't duplicate entries).
- `npm run build` + manual check: subscribe the generated URL in an actual
  calendar app (Google Calendar "Add by URL") to confirm real-world
  compatibility, not just RFC-5545 string correctness.
