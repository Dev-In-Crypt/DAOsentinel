'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface VoteRow {
  createdAt: Date | string;
  choice: number;
  votingPower: string | number;
}

const CHOICE_COLOR = [
  'hsl(159, 64%, 52%)', // mint    — choice 1 (typically For)
  'hsl(349, 89%, 60%)', // rose    — choice 2 (typically Against)
  'hsl(43, 96%, 56%)',  // amber   — choice 3 (Abstain)
  'hsl(189, 86%, 53%)', // cyan    — extra
  'hsl(234, 89%, 74%)', // indigo  — extra
];

const SLICES = 24; // 24 time buckets across the voting window

/**
 * Stacked area chart of cumulative voting power per choice over time.
 * Exposes last-minute swings visually — if a curve crosses near the right
 * edge, the outcome flipped late.
 */
export function VoteTimeline({
  votes,
  choices,
  startTimestamp,
  endTimestamp,
}: {
  votes: VoteRow[];
  choices: string[];
  startTimestamp: Date | string;
  endTimestamp: Date | string;
}) {
  if (!votes.length || !choices.length) return null;

  const startMs = new Date(startTimestamp).getTime();
  const endMs = new Date(endTimestamp).getTime();
  const duration = endMs - startMs;
  if (duration <= 0) return null;
  const sliceMs = duration / SLICES;

  // Initialize buckets: an array of SLICES+1 snapshots, each holding cumulative VP per choice
  const initial: Record<string, number> = {};
  choices.forEach((c, i) => {
    initial[c || `Choice ${i + 1}`] = 0;
  });
  const buckets = Array.from({ length: SLICES + 1 }, (_, i) => ({
    t: new Date(startMs + i * sliceMs).toISOString(),
    label: `${Math.round(((i * sliceMs) / duration) * 100)}%`,
    ...initial,
  }));

  // Sort votes by time + accumulate per bucket
  const sorted = [...votes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const v of sorted) {
    const t = new Date(v.createdAt).getTime();
    const idx = Math.min(SLICES, Math.max(0, Math.floor((t - startMs) / sliceMs)));
    const choiceLabel = choices[v.choice - 1] ?? `Choice ${v.choice}`;
    for (let i = idx; i <= SLICES; i++) {
      const bucket = buckets[i] as unknown as Record<string, number | string>;
      bucket[choiceLabel] = ((bucket[choiceLabel] as number) ?? 0) + Number(v.votingPower);
    }
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={buckets} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(225, 32%, 65% / 0.08)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(225, 22%, 45%)', fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            interval={3}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(225, 22%, 45%)', fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v) => {
              if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
              if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
              if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
              return String(v);
            }}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(226, 30%, 13%)',
              border: '1px solid hsl(222, 32%, 65% / 0.22)',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 12,
            }}
            labelStyle={{ color: 'hsl(226, 25%, 69%)', fontSize: 10 }}
            formatter={(value: number) => {
              if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
              if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
              if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
              return String(Math.round(value));
            }}
          />
          {choices.map((c, i) => {
            const label = c || `Choice ${i + 1}`;
            const color = CHOICE_COLOR[i % CHOICE_COLOR.length];
            return (
              <Area
                key={label}
                type="monotone"
                dataKey={label}
                stackId="1"
                stroke={color}
                fill={color}
                fillOpacity={0.5}
                strokeWidth={1.5}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
