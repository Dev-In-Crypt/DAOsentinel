'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc-client';
import { Badge } from '@/components/ui/badge';

const WINDOWS = [
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last 12 months', days: 365 },
];

interface SubmittedQuery {
  hypotheticalVp: number;
  excludeVoter?: string;
  sinceDays: number;
}

export function SimulatorForm({ daoSlug }: { daoSlug: string }) {
  const [vpInput, setVpInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');
  const [sinceDays, setSinceDays] = useState(365);
  const [query, setQuery] = useState<SubmittedQuery | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isFetching } = trpc.simulator.run.useQuery(
    {
      daoSlug,
      hypotheticalVp: query?.hypotheticalVp ?? 1,
      sinceDays: query?.sinceDays ?? sinceDays,
      excludeVoter: query?.excludeVoter,
    },
    { enabled: query != null },
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const vp = Number(vpInput);
    if (!Number.isFinite(vp) || vp <= 0) {
      setFormError('Enter a positive voting-power amount.');
      return;
    }
    setFormError(null);
    setQuery({
      hypotheticalVp: vp,
      excludeVoter: excludeInput.trim() || undefined,
      sinceDays,
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="glass-card flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
            Hypothetical VP
          </span>
          <input
            type="number"
            min="0"
            step="any"
            required
            value={vpInput}
            onChange={(e) => setVpInput(e.target.value)}
            placeholder="e.g. 100000"
            className="h-11 w-48 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
            Exclude address (optional)
          </span>
          <input
            type="text"
            value={excludeInput}
            onChange={(e) => setExcludeInput(e.target.value)}
            placeholder="0x…"
            className="h-11 w-56 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
            Window
          </span>
          <select
            value={sinceDays}
            onChange={(e) => setSinceDays(Number(e.target.value))}
            className="h-11 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
          >
            {WINDOWS.map((w) => (
              <option key={w.days} value={w.days}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="btn-mc btn-mc-primary"
          style={{ height: 44 }}
          disabled={isFetching}
        >
          {isFetching ? 'Simulating…' : 'Run simulation →'}
        </button>
      </form>
      {formError && (
        <p className="text-xs" style={{ color: 'hsl(var(--rose))' }}>
          {formError}
        </p>
      )}

      {/* Required disclaimer — see docs/specs/voting-power-simulator.md */}
      <p className="max-w-2xl text-xs text-[hsl(var(--text-dim))]">
        Historical replay of past votes. Assumes your hypothetical VP would have voted for the
        runner-up choice — not a prediction of how you&rsquo;d actually vote, and not financial
        advice.
      </p>

      {query && !isFetching && data === null && (
        <div className="glass-card py-10 text-center text-sm text-[hsl(var(--text-dim))]">
          DAO not found.
        </div>
      )}

      {query && !isFetching && data && data.totalProposals < 3 && (
        <div className="glass-card py-10 text-center text-sm text-[hsl(var(--text-dim))]">
          Not enough historical data to simulate yet.
        </div>
      )}

      {query && data && data.totalProposals >= 3 && (
        <div className="space-y-4">
          <div className="glass-card">
            <div className="text-lg">
              Would have swung{' '}
              <span className="mono font-bold text-[hsl(var(--cyan))]">{data.swungCount}</span> of{' '}
              {data.totalProposals} votes in the selected window.
            </div>
          </div>
          <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
            {data.results.map((r) => (
              <div key={r.proposalId} className="flex items-center justify-between gap-3 p-4">
                <div className="line-clamp-1 text-sm font-medium">{r.title}</div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {r.wouldHaveSwungOutcome && <Badge variant="warning">Would swing</Badge>}
                  {r.wouldHaveMetQuorum && <Badge variant="outline">Would meet quorum</Badge>}
                  {!r.wouldHaveSwungOutcome && !r.wouldHaveMetQuorum && (
                    <Badge variant="secondary">No change</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
