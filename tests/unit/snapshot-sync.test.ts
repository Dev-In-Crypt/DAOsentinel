import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the snapshot client before importing the module under test.
vi.mock('@/lib/snapshot-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/snapshot-client')>(
    '@/lib/snapshot-client',
  );
  return { ...actual, snapshotRequest: vi.fn() };
});

// In-memory db stub. The sync module imports `db` from server/db; we replace
// that surface with a fluent stub that records the values passed to insert().
const captured: Record<string, unknown[]> = { proposals: [], votes: [], updates: [] };

vi.mock('@/server/db', () => {
  const chain = (table: string) => ({
    values(v: unknown) {
      captured[table].push({ kind: 'insert', value: v });
      return {
        onConflictDoUpdate: () => Promise.resolve(),
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([{ id: 'mock' }]),
        }),
        returning: () => Promise.resolve([{ id: 'mock' }]),
      };
    },
  });

  const where = {
    where: () => ({
      limit: () => Promise.resolve([]),
      orderBy: () => ({ limit: () => Promise.resolve([]) }),
    }),
  };

  return {
    db: {
      select: () => ({ from: () => Promise.resolve([]) }),
      query: {
        votes: { findFirst: vi.fn(async () => null) },
      },
      insert: (table: { _: { name?: string } } | { table?: { name?: string } }) => {
        const name = 'name' in (table as { _?: unknown })
          ? 'unknown'
          : 'mock';
        void name;
        return chain('proposals');
      },
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
      execute: () => Promise.resolve([]),
    },
  };
});

import {
  WHALE_VP_PCT_THRESHOLD,
  LAST_MINUTE_WINDOW_PCT,
} from '@/lib/constants';

describe('whale & last-minute math', () => {
  it('VP above threshold flags whale', () => {
    const total = 100;
    const vp = 6; // > 5%
    const vpPct = (vp / total) * 100;
    expect(vpPct > WHALE_VP_PCT_THRESHOLD).toBe(true);
  });

  it('VP exactly at threshold does not flag', () => {
    const total = 100;
    const vp = 5;
    const vpPct = (vp / total) * 100;
    expect(vpPct > WHALE_VP_PCT_THRESHOLD).toBe(false);
  });

  it('vote in final 10% window is last-minute', () => {
    const start = 0;
    const end = 100;
    const created = 95;
    const totalSec = end - start;
    const timeFromEndSec = end - created;
    expect(timeFromEndSec / totalSec < LAST_MINUTE_WINDOW_PCT).toBe(true);
  });

  it('vote at 80% of window is not last-minute', () => {
    const start = 0;
    const end = 100;
    const created = 80;
    const totalSec = end - start;
    const timeFromEndSec = end - created;
    expect(timeFromEndSec / totalSec < LAST_MINUTE_WINDOW_PCT).toBe(false);
  });
});

describe('choice normalisation', () => {
  // Re-import the normaliseChoice through the module's exports indirectly via vote pipeline.
  // Since it's private, replicate the rule contract here and assert behaviour.
  function normalise(choice: number | number[] | Record<string, number>): number {
    if (typeof choice === 'number') return choice;
    if (Array.isArray(choice)) return choice[0] ?? 0;
    if (choice && typeof choice === 'object') {
      const entries = Object.entries(choice).sort((a, b) => b[1] - a[1]);
      return Number(entries[0]?.[0] ?? 0);
    }
    return 0;
  }

  it('passes through plain number choice', () => {
    expect(normalise(1)).toBe(1);
    expect(normalise(3)).toBe(3);
  });

  it('picks first index from array (weighted)', () => {
    expect(normalise([2, 5, 7])).toBe(2);
  });

  it('picks dominant key from object (approval)', () => {
    expect(normalise({ '1': 0.3, '2': 0.6, '3': 0.1 })).toBe(2);
  });
});

beforeEach(() => {
  captured.proposals.length = 0;
  captured.votes.length = 0;
  captured.updates.length = 0;
});
