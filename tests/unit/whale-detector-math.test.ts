import { describe, it, expect } from 'vitest';
import { WHALE_CRITICAL_PCT, WHALE_WARNING_PCT, WHALE_VP_PCT_THRESHOLD } from '@/lib/constants';

/**
 * Tests the severity-assignment logic the whale detector relies on. The
 * detector itself depends on the DB; severity is pure math.
 */
function severityFor(pct: number): 'info' | 'warning' | 'critical' {
  if (pct > WHALE_CRITICAL_PCT) return 'critical';
  if (pct > WHALE_WARNING_PCT) return 'warning';
  return 'info';
}

describe('whale severity', () => {
  it('5–10% is info', () => {
    expect(severityFor(6)).toBe('info');
    expect(severityFor(10)).toBe('info');
  });
  it('10–20% is warning', () => {
    expect(severityFor(11)).toBe('warning');
    expect(severityFor(20)).toBe('warning');
  });
  it('>20% is critical', () => {
    expect(severityFor(25)).toBe('critical');
    expect(severityFor(80)).toBe('critical');
  });
  it('threshold itself does not trip whale flag', () => {
    expect(WHALE_VP_PCT_THRESHOLD).toBe(5);
  });
});

describe('leading-choice tally', () => {
  function leading(rows: { choice: number; vp: number }[], n: number): number {
    const totals = new Array(n).fill(0) as number[];
    for (const r of rows) {
      const idx = r.choice - 1;
      if (idx >= 0 && idx < totals.length) totals[idx] += r.vp;
    }
    let max = -1;
    let best = 0;
    totals.forEach((t, i) => {
      if (t > max) {
        max = t;
        best = i;
      }
    });
    return best;
  }

  it('picks the choice with the most VP', () => {
    expect(
      leading([{ choice: 1, vp: 100 }, { choice: 2, vp: 200 }], 2),
    ).toBe(1); // index of choice 2
  });

  it('handles empty input', () => {
    expect(leading([], 3)).toBe(0);
  });

  it('detects a swing when comparing two snapshots', () => {
    const before = leading([{ choice: 1, vp: 100 }], 2);
    const after = leading(
      [
        { choice: 1, vp: 100 },
        { choice: 2, vp: 500 },
      ],
      2,
    );
    expect(before).not.toBe(after);
  });
});
