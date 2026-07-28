import { describe, it, expect } from 'vitest';
import { csvEscapeField, formatOrgReportCsv, type OrgReportCsvInput } from '@/lib/org-report-csv';

describe('csvEscapeField', () => {
  it('leaves plain values unquoted', () => {
    expect(csvEscapeField('Uniswap')).toBe('Uniswap');
    expect(csvEscapeField(42)).toBe('42');
  });

  it('quotes values containing a comma', () => {
    expect(csvEscapeField('Raise treasury, then vote')).toBe('"Raise treasury, then vote"');
  });

  it('quotes and doubles embedded double quotes', () => {
    expect(csvEscapeField('Say "yes" now')).toBe('"Say ""yes"" now"');
  });

  it('quotes values containing an embedded newline', () => {
    expect(csvEscapeField('Line one\nLine two')).toBe('"Line one\nLine two"');
  });

  it('quotes values containing an embedded carriage return', () => {
    expect(csvEscapeField('Line one\r\nLine two')).toBe('"Line one\r\nLine two"');
  });

  it('handles a value with commas, quotes, and newlines all at once', () => {
    const input = 'Title, "the big one"\nsecond line';
    expect(csvEscapeField(input)).toBe('"Title, ""the big one""\nsecond line"');
  });

  it('renders null/undefined as an empty string', () => {
    expect(csvEscapeField(null)).toBe('');
    expect(csvEscapeField(undefined)).toBe('');
  });

  it('renders a Date as its ISO string', () => {
    const d = new Date('2026-01-15T00:00:00.000Z');
    expect(csvEscapeField(d)).toBe('2026-01-15T00:00:00.000Z');
  });
});

function baseInput(overrides: Partial<OrgReportCsvInput> = {}): OrgReportCsvInput {
  return {
    organizationName: 'Acme DAO Fund',
    daoName: 'Uniswap',
    daoSlug: 'uniswap',
    generatedAt: new Date('2026-07-28T12:00:00.000Z'),
    activeProposals: [],
    recentProposals: [],
    alerts: [],
    scoreHistory: [],
    notes: [],
    ...overrides,
  };
}

describe('formatOrgReportCsv', () => {
  it('includes a title line naming the organization and DAO', () => {
    const csv = formatOrgReportCsv(baseInput());
    expect(csv).toContain('DAO Sentinel org report — Acme DAO Fund — Uniswap');
    expect(csv).toContain('Generated 2026-07-28T12:00:00.000Z');
  });

  it('renders each section header even when empty', () => {
    const csv = formatOrgReportCsv(baseInput());
    expect(csv).toContain('Active proposals');
    expect(csv).toContain('Title,State,Votes,Ends');
    expect(csv).toContain('Recent proposals');
    expect(csv).toContain('Title,State,Votes,Created');
    expect(csv).toContain('Recent alerts');
    expect(csv).toContain('Severity,Title,Description,Created');
    expect(csv).toContain('Democracy Score history');
    expect(csv).toContain('Date,Score');
    expect(csv).toContain('Concierge notes');
    expect(csv).toContain('Subject type,Subject,Note,Author,Created');
  });

  it('renders a proposal row with plain fields unquoted', () => {
    const csv = formatOrgReportCsv(
      baseInput({
        activeProposals: [
          {
            title: 'Raise treasury allocation',
            state: 'active',
            votesCount: 128,
            timestamp: new Date('2026-08-01T00:00:00.000Z'),
          },
        ],
      }),
    );
    expect(csv).toContain(
      'Raise treasury allocation,active,128,2026-08-01T00:00:00.000Z',
    );
  });

  it('escapes a proposal title containing a comma', () => {
    const csv = formatOrgReportCsv(
      baseInput({
        recentProposals: [
          {
            title: 'Fund grants, round 3',
            state: 'closed',
            votesCount: 50,
            timestamp: new Date('2026-07-01T00:00:00.000Z'),
          },
        ],
      }),
    );
    expect(csv).toContain('"Fund grants, round 3",closed,50,2026-07-01T00:00:00.000Z');
  });

  it('escapes an alert description containing embedded quotes and a newline', () => {
    const csv = formatOrgReportCsv(
      baseInput({
        alerts: [
          {
            severity: 'critical',
            title: 'Whale vote detected',
            description: 'A single voter cast "51%" of votes.\nReview before quorum closes.',
            createdAt: new Date('2026-07-20T00:00:00.000Z'),
          },
        ],
      }),
    );
    expect(csv).toContain(
      '"A single voter cast ""51%"" of votes.\nReview before quorum closes."',
    );
  });

  it('renders score history rows with numeric scores', () => {
    const csv = formatOrgReportCsv(
      baseInput({
        scoreHistory: [
          { score: 72.5, computedAt: new Date('2026-07-10T00:00:00.000Z') },
          { score: 74, computedAt: new Date('2026-07-11T00:00:00.000Z') },
        ],
      }),
    );
    expect(csv).toContain('2026-07-10T00:00:00.000Z,72.5');
    expect(csv).toContain('2026-07-11T00:00:00.000Z,74');
  });

  it('escapes a note whose text contains commas, quotes, and newlines together', () => {
    const csv = formatOrgReportCsv(
      baseInput({
        notes: [
          {
            subjectType: 'proposal',
            subjectLabel: 'Raise treasury, phase 2',
            note: 'Discussed with the "core team", they agreed.\nFollow up next week.',
            authorLabel: 'Jamie Rivera',
            createdAt: new Date('2026-07-15T00:00:00.000Z'),
          },
        ],
      }),
    );
    expect(csv).toContain('proposal,"Raise treasury, phase 2"');
    expect(csv).toContain(
      '"Discussed with the ""core team"", they agreed.\nFollow up next week."',
    );
    expect(csv).toContain('Jamie Rivera,2026-07-15T00:00:00.000Z');
  });

  it('falls back to the raw subject id when no title was resolved', () => {
    const csv = formatOrgReportCsv(
      baseInput({
        notes: [
          {
            subjectType: 'alert',
            subjectLabel: 'alert-id-that-no-longer-exists',
            note: 'Stale reference',
            authorLabel: 'ops@example.com',
            createdAt: new Date('2026-07-16T00:00:00.000Z'),
          },
        ],
      }),
    );
    expect(csv).toContain('alert,alert-id-that-no-longer-exists,Stale reference');
  });
});
