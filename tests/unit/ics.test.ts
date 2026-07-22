import { describe, it, expect } from 'vitest';
import { toIcs, type IcsEvent } from '@/lib/ics';

const GENERATED = new Date('2026-07-22T00:00:00Z');

function event(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: 'proposal-1@daosentinel.xyz',
    title: 'Uniswap: Raise fee tier',
    start: new Date('2026-07-25T12:00:00Z'),
    end: new Date('2026-07-28T12:00:00Z'),
    url: 'https://www.daosentinel.xyz/proposals/1',
    ...overrides,
  };
}

describe('toIcs', () => {
  it('produces a well-formed VCALENDAR with correct wrapper fields', () => {
    const ics = toIcs([event()], 'DAO Sentinel — Uniswap Deadlines', GENERATED);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//DAO Sentinel//Governance Calendar//EN');
    expect(ics).toContain('X-WR-CALNAME:DAO Sentinel — Uniswap Deadlines');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('renders one VEVENT per event with all required fields', () => {
    const ics = toIcs(
      [event({ uid: 'a1' }), event({ uid: 'a2', title: 'Aave: Quorum risk proposal' })],
      'Feed',
      GENERATED,
    );
    const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(count).toBe(2);
    expect(ics).toContain('UID:a1');
    expect(ics).toContain('UID:a2');
    expect(ics).toContain('SUMMARY:Aave: Quorum risk proposal');
  });

  it('formats DTSTAMP/DTSTART/DTEND as UTC basic-format timestamps', () => {
    const ics = toIcs([event()], 'Feed', GENERATED);
    expect(ics).toContain('DTSTAMP:20260722T000000Z');
    expect(ics).toContain('DTSTART:20260725T120000Z');
    expect(ics).toContain('DTEND:20260728T120000Z');
  });

  it('escapes RFC 5545 TEXT-value special characters', () => {
    const ics = toIcs(
      [event({ title: 'Vote; on, risky\\ path\nwith a newline' })],
      'Feed',
      GENERATED,
    );
    expect(ics).toContain('SUMMARY:Vote\\; on\\, risky\\\\ path\\nwith a newline');
  });

  it('produces stable UIDs across repeated calls with the same input (no reader-side duplicates)', () => {
    const e = event();
    const first = toIcs([e], 'Feed', GENERATED);
    const second = toIcs([e], 'Feed', GENERATED);
    expect(first).toBe(second);
  });

  it('renders a valid empty calendar (no events) without throwing', () => {
    const ics = toIcs([], 'Empty', GENERATED);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('folds lines longer than 75 octets per RFC 5545 §3.1', () => {
    const longTitle = 'A'.repeat(120);
    const ics = toIcs([event({ title: longTitle })], 'Feed', GENERATED);
    const rawLines = ics.split('\r\n');
    for (const line of rawLines) {
      // A continuation line (starting with a space) is allowed to be longer once rejoined;
      // every physical line as written must itself respect the fold limit.
      expect(line.length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain('SUMMARY:' + 'A'.repeat(67));
  });
});
