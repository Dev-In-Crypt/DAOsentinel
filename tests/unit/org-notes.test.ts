import { describe, it, expect } from 'vitest';
import {
  collectSubjectIds,
  filterNotesForDao,
  formatUnresolvedNotesNotice,
  type OrgNoteRow,
  type OrgNoteSubjects,
} from '@/server/api/org-notes';

const DAO_A = '11111111-1111-4111-8111-111111111111';
const DAO_B = '22222222-2222-4222-8222-222222222222';
const PROPOSAL_IN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROPOSAL_IN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ALERT_IN_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DELETED_PROPOSAL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let seq = 0;
function makeNote(overrides: Partial<OrgNoteRow> = {}): OrgNoteRow {
  seq += 1;
  return {
    id: `note-${seq}`,
    subjectType: 'proposal',
    subjectId: PROPOSAL_IN_A,
    note: `Note ${seq}`,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    authorName: 'Concierge',
    authorEmail: 'concierge@example.com',
    ...overrides,
  };
}

function makeSubjects(): OrgNoteSubjects {
  return {
    proposals: new Map([
      [PROPOSAL_IN_A, { daoId: DAO_A, title: 'Fund the grants program' }],
      [PROPOSAL_IN_B, { daoId: DAO_B, title: 'Other DAO treasury swap' }],
    ]),
    alerts: new Map([[ALERT_IN_A, { daoId: DAO_A, title: 'Whale vote detected' }]]),
  };
}

describe('collectSubjectIds (uuid guard before any inArray)', () => {
  it('splits ids by subject type', () => {
    const result = collectSubjectIds([
      makeNote({ subjectType: 'proposal', subjectId: PROPOSAL_IN_A }),
      makeNote({ subjectType: 'alert', subjectId: ALERT_IN_A }),
    ]);
    expect(result).toEqual({ proposalIds: [PROPOSAL_IN_A], alertIds: [ALERT_IN_A] });
  });

  it('drops a non-uuid subjectId so it never reaches an inArray (the 500)', () => {
    const result = collectSubjectIds([
      makeNote({ subjectType: 'proposal', subjectId: 'not-a-uuid' }),
      makeNote({ subjectType: 'alert', subjectId: '' }),
      makeNote({ subjectType: 'proposal', subjectId: `${PROPOSAL_IN_A}-extra` }),
      makeNote({ subjectType: 'proposal', subjectId: PROPOSAL_IN_A.slice(0, -1) }),
    ]);
    expect(result).toEqual({ proposalIds: [], alertIds: [] });
  });

  it('ignores notes with an unknown subjectType', () => {
    const result = collectSubjectIds([makeNote({ subjectType: 'delegate', subjectId: DAO_A })]);
    expect(result).toEqual({ proposalIds: [], alertIds: [] });
  });

  it('de-duplicates ids shared by several notes', () => {
    const result = collectSubjectIds([
      makeNote({ subjectId: PROPOSAL_IN_A }),
      makeNote({ subjectId: PROPOSAL_IN_A }),
    ]);
    expect(result.proposalIds).toEqual([PROPOSAL_IN_A]);
  });

  it('returns empty arrays for no notes', () => {
    expect(collectSubjectIds([])).toEqual({ proposalIds: [], alertIds: [] });
  });
});

describe('filterNotesForDao (DAO scoping via the note subject)', () => {
  it('keeps a proposal-subject note whose proposal belongs to this DAO', () => {
    const note = makeNote({ subjectType: 'proposal', subjectId: PROPOSAL_IN_A });
    const result = filterNotesForDao([note], makeSubjects(), DAO_A);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].id).toBe(note.id);
    expect(result.notes[0].subjectLabel).toBe('Fund the grants program');
    expect(result.unresolvedCount).toBe(0);
  });

  it('keeps an alert-subject note whose alert belongs to this DAO', () => {
    const note = makeNote({ subjectType: 'alert', subjectId: ALERT_IN_A });
    const result = filterNotesForDao([note], makeSubjects(), DAO_A);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].subjectLabel).toBe('Whale vote detected');
    expect(result.unresolvedCount).toBe(0);
  });

  it('excludes a note whose subject belongs to another DAO in the same org', () => {
    const note = makeNote({ subjectType: 'proposal', subjectId: PROPOSAL_IN_B });
    const result = filterNotesForDao([note], makeSubjects(), DAO_A);
    expect(result.notes).toEqual([]);
    // Not broken — it belongs on DAO-B's view — so it is not reported as unresolved.
    expect(result.unresolvedCount).toBe(0);
  });

  it('excludes and counts a note with a non-uuid subjectId', () => {
    const note = makeNote({ subjectType: 'proposal', subjectId: 'not-a-uuid' });
    const result = filterNotesForDao([note], makeSubjects(), DAO_A);
    expect(result.notes).toEqual([]);
    expect(result.unresolvedCount).toBe(1);
  });

  it('excludes and counts a note whose subject row was deleted', () => {
    const note = makeNote({ subjectType: 'proposal', subjectId: DELETED_PROPOSAL });
    const result = filterNotesForDao([note], makeSubjects(), DAO_A);
    expect(result.notes).toEqual([]);
    expect(result.unresolvedCount).toBe(1);
  });

  it('excludes and counts a note with an unknown subjectType', () => {
    const note = makeNote({ subjectType: 'delegate', subjectId: PROPOSAL_IN_A });
    const result = filterNotesForDao([note], makeSubjects(), DAO_A);
    expect(result.notes).toEqual([]);
    expect(result.unresolvedCount).toBe(1);
  });

  it('preserves input order and reports a mixed batch in one pass', () => {
    const notes = [
      makeNote({ id: 'keep-1', subjectType: 'proposal', subjectId: PROPOSAL_IN_A }),
      makeNote({ id: 'other-dao', subjectType: 'proposal', subjectId: PROPOSAL_IN_B }),
      makeNote({ id: 'keep-2', subjectType: 'alert', subjectId: ALERT_IN_A }),
      makeNote({ id: 'bad-id', subjectType: 'proposal', subjectId: 'not-a-uuid' }),
      makeNote({ id: 'deleted', subjectType: 'alert', subjectId: DELETED_PROPOSAL }),
    ];
    const result = filterNotesForDao(notes, makeSubjects(), DAO_A);
    expect(result.notes.map((n) => n.id)).toEqual(['keep-1', 'keep-2']);
    expect(result.unresolvedCount).toBe(2);
  });

  it('returns an empty result for no notes', () => {
    expect(filterNotesForDao([], makeSubjects(), DAO_A)).toEqual({
      notes: [],
      unresolvedCount: 0,
    });
  });

  it('carries the author fields through untouched', () => {
    const note = makeNote({ authorName: null, authorEmail: 'ops@example.com' });
    const result = filterNotesForDao([note], makeSubjects(), DAO_A);
    expect(result.notes[0].authorName).toBeNull();
    expect(result.notes[0].authorEmail).toBe('ops@example.com');
  });
});

describe('formatUnresolvedNotesNotice (shared copy across surfaces)', () => {
  it('returns null when nothing was excluded', () => {
    expect(formatUnresolvedNotesNotice(0, 'Uniswap')).toBeNull();
  });

  it('names the DAO and uses the singular form for one note', () => {
    expect(formatUnresolvedNotesNotice(1, 'Uniswap')).toBe(
      '1 concierge note could not be matched to Uniswap and is not shown — the linked proposal or alert is missing, or its subject id is malformed.',
    );
  });

  it('uses the plural form for several notes', () => {
    expect(formatUnresolvedNotesNotice(3, 'Aave')).toBe(
      '3 concierge notes could not be matched to Aave and are not shown — the linked proposal or alert is missing, or its subject id is malformed.',
    );
  });
});
