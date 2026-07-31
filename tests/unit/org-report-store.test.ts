import { describe, expect, it } from 'vitest';
import {
  formatWeekRange,
  parseStoredVisuals,
  startOfIsoWeekUtc,
  stripLeadingH1,
} from '@/server/services/org-report/store';

/**
 * Pure helpers only — the DB-touching parts of the store are exercised by the
 * live walkthrough, not mocked here.
 *
 * `startOfIsoWeekUtc` is load-bearing beyond formatting: it is the key of a
 * UNIQUE index, so a wrong answer means either two rows for one week (a
 * customer's report changing under them) or two weeks collapsing into one row.
 */

describe('startOfIsoWeekUtc', () => {
  it('floors a mid-week instant to Monday 00:00 UTC', () => {
    // Wednesday 2026-07-29T14:32:10Z
    const got = startOfIsoWeekUtc(new Date('2026-07-29T14:32:10.500Z'));
    expect(got.toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });

  it('is a fixed point on Monday midnight', () => {
    const monday = new Date('2026-07-27T00:00:00.000Z');
    expect(startOfIsoWeekUtc(monday).toISOString()).toBe(monday.toISOString());
  });

  it('keeps the last second of Monday in the same week', () => {
    const got = startOfIsoWeekUtc(new Date('2026-07-27T23:59:59.999Z'));
    expect(got.toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });

  // The regression that matters: getUTCDay() is 0 on Sunday, so a naive
  // `date - day + 1` would push Sunday FORWARD into the following week and
  // split one week across two rows.
  it('floors Sunday back to the Monday six days earlier, not forward', () => {
    const got = startOfIsoWeekUtc(new Date('2026-08-02T23:00:00.000Z'));
    expect(got.toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });

  it('puts the following Monday in the next week', () => {
    const got = startOfIsoWeekUtc(new Date('2026-08-03T00:00:00.000Z'));
    expect(got.toISOString()).toBe('2026-08-03T00:00:00.000Z');
  });

  it('crosses a month boundary', () => {
    // Tuesday 2026-09-01 → Monday 2026-08-31
    expect(startOfIsoWeekUtc(new Date('2026-09-01T09:00:00.000Z')).toISOString()).toBe(
      '2026-08-31T00:00:00.000Z',
    );
  });

  it('crosses a year boundary', () => {
    // Friday 2027-01-01 → Monday 2026-12-28
    expect(startOfIsoWeekUtc(new Date('2027-01-01T12:00:00.000Z')).toISOString()).toBe(
      '2026-12-28T00:00:00.000Z',
    );
  });

  it('does not mutate its argument', () => {
    const input = new Date('2026-07-29T14:32:10.500Z');
    const before = input.toISOString();
    startOfIsoWeekUtc(input);
    expect(input.toISOString()).toBe(before);
  });
});

describe('stripLeadingH1', () => {
  it('removes the title line and the blank line after it', () => {
    const body = '# Acme — Aave governance report — week of 2026-07-29\n\n## Executive summary\n\nText.';
    expect(stripLeadingH1(body)).toBe('## Executive summary\n\nText.');
  });

  it('leaves a body without a leading h1 untouched', () => {
    const body = '## Executive summary\n\nText.';
    expect(stripLeadingH1(body)).toBe(body);
  });

  it('does not strip an h2 that merely starts with a hash', () => {
    const body = '## Not the title\n\nText.';
    expect(stripLeadingH1(body)).toBe(body);
  });

  it('handles a title-only document', () => {
    expect(stripLeadingH1('# Only a title')).toBe('');
  });

  it('preserves later headings of the same level', () => {
    const body = '# Title\n\nIntro.\n\n# Second h1\n\nMore.';
    expect(stripLeadingH1(body)).toBe('Intro.\n\n# Second h1\n\nMore.');
  });
});

describe('formatWeekRange', () => {
  it('collapses the month when the week does not cross one', () => {
    // 2026-07-06 (Mon) .. 2026-07-12 (Sun), both in July.
    expect(formatWeekRange(new Date('2026-07-06T00:00:00.000Z'))).toBe('6 – 12 Jul 2026');
  });

  it('names both months when the week crosses one', () => {
    // 2026-07-27 (Mon) .. 2026-08-02 (Sun)
    expect(formatWeekRange(new Date('2026-07-27T00:00:00.000Z'))).toBe('27 Jul – 2 Aug 2026');
  });

  // "Sept" vs "Sep" is exactly the ICU-dependent case that made this stop
  // using toLocaleDateString.
  it('abbreviates September to three letters', () => {
    // 2026-08-31 (Mon) .. 2026-09-06 (Sun)
    expect(formatWeekRange(new Date('2026-08-31T00:00:00.000Z'))).toBe('31 Aug – 6 Sep 2026');
  });

  it('reads in UTC regardless of the process timezone', () => {
    // Monday 00:00 UTC is Sunday evening in the Americas; a local-time
    // formatter would print the previous day here.
    expect(formatWeekRange(new Date('2026-07-27T00:00:00.000Z'))).toMatch(/^27 Jul/);
  });
});

/**
 * `payload` is untyped jsonb. Every row written before TODO-081 has no
 * `visuals` key at all, so the archive — reports customers can still download
 * — is full of legacy shapes this must not choke on.
 */
describe('parseStoredVisuals', () => {
  it('reads a well-formed payload back out unchanged', () => {
    const visuals = {
      quorumMeters: [{ label: 'Fee switch activation', pct: 62, status: 'at_risk' }],
      attributionBars: [{ label: 'Voter participation', contribution: -5 }],
    };
    expect(parseStoredVisuals({ summary: {}, recommendations: [], visuals })).toEqual(visuals);
  });

  it('degrades to empty arrays for a legacy row with no visuals key', () => {
    expect(parseStoredVisuals({ summary: {}, recommendations: [] })).toEqual({
      quorumMeters: [],
      attributionBars: [],
    });
  });

  it('degrades to empty arrays for a null payload', () => {
    expect(parseStoredVisuals(null)).toEqual({ quorumMeters: [], attributionBars: [] });
  });

  it('drops malformed entries instead of throwing', () => {
    const payload = {
      visuals: {
        quorumMeters: [
          { label: 'ok', pct: 50, status: 'met' },
          { label: 'bad status', pct: 50, status: 'nonsense' },
          { pct: 50, status: 'met' },
          'not an object',
          null,
        ],
        attributionBars: [
          { label: 'ok', contribution: -1 },
          { label: 'bad', contribution: 'x' },
        ],
      },
    };
    expect(parseStoredVisuals(payload)).toEqual({
      quorumMeters: [{ label: 'ok', pct: 50, status: 'met' }],
      attributionBars: [{ label: 'ok', contribution: -1 }],
    });
  });

  it('degrades when the arrays are not arrays', () => {
    expect(parseStoredVisuals({ visuals: { quorumMeters: 'nope', attributionBars: 7 } })).toEqual({
      quorumMeters: [],
      attributionBars: [],
    });
  });
});
