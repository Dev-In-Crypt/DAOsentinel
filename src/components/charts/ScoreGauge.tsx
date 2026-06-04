import { cn } from '@/lib/utils';

export function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const tone =
    s >= 70 ? 'hsl(var(--mint))' : s >= 55 ? 'hsl(var(--amber))' : 'hsl(var(--rose))';
  const dim = size === 'lg' ? 'h-32 w-32' : size === 'sm' ? 'h-16 w-16' : 'h-24 w-24';
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const fontSize =
    size === 'lg' ? '1.5rem' : size === 'sm' ? '0.875rem' : '1.125rem';

  return (
    <div className={cn('relative flex items-center justify-center', dim)}>
      <svg viewBox="0 0 100 100" className="-rotate-90">
        <defs>
          <linearGradient id={`gauge-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--indigo-bright))" />
            <stop offset="100%" stopColor="hsl(var(--cyan))" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={radius}
          stroke="hsl(var(--text-dim) / 0.15)"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(s / 100) * circ} ${circ}`}
          stroke={tone}
          style={{ filter: `drop-shadow(0 0 6px ${tone})` }}
        />
      </svg>
      <div
        className="absolute mono font-bold text-center"
        style={{ fontSize, color: tone, textShadow: `0 0 12px ${tone}` }}
      >
        {s.toFixed(0)}
      </div>
    </div>
  );
}
