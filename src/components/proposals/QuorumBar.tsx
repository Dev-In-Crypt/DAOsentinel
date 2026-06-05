import { formatNumber } from '@/lib/utils';

/**
 * Horizontal progress bar that visualizes current / target quorum.
 * Bar is capped at 100%; if current > target we show a small "over" pill.
 * Tone shifts mint → amber → rose based on how far from quorum we are.
 */
export function QuorumBar({
  current,
  target,
  unit,
}: {
  current: number;
  target: number;
  unit?: string;
}) {
  if (!target || target <= 0) return null;
  const pct = (current / target) * 100;
  const capped = Math.min(100, pct);
  const tone =
    pct >= 100 ? 'hsl(var(--mint))' : pct >= 60 ? 'hsl(var(--amber))' : 'hsl(var(--rose))';

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
          Quorum
        </div>
        <div className="mono text-sm">
          <span style={{ color: tone }}>{formatNumber(current)}</span>
          <span className="text-[hsl(var(--text-dim))]"> / {formatNumber(target)}{unit ? ` ${unit}` : ''}</span>
          <span className="ml-2 text-[hsl(var(--text-dim))]">({pct.toFixed(0)}%)</span>
        </div>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full"
        style={{ background: 'hsl(var(--text-dim) / 0.10)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${capped}%`,
            background: tone,
            boxShadow: `0 0 12px ${tone}`,
          }}
        />
      </div>
      {pct >= 100 && (
        <div
          className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider mono"
          style={{
            background: 'hsl(var(--mint) / 0.14)',
            color: 'hsl(var(--mint))',
            boxShadow: 'inset 0 0 0 1px hsl(var(--mint) / 0.35)',
          }}
        >
          ✓ Quorum met
        </div>
      )}
    </div>
  );
}
