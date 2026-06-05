'use client';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface Point {
  day: string; // formatted date label
  score: number;
}

/**
 * 30-90 day Democracy Score line. Caller passes already-bucketed daily data.
 * Hidden by caller when there are < 3 points.
 */
export function ScoreTrend({ data }: { data: Point[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(234, 89%, 74%)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="hsl(189, 86%, 53%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(225, 32%, 65% / 0.08)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 10, fill: 'hsl(225, 22%, 45%)', fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: 'hsl(225, 22%, 45%)', fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            width={32}
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
            formatter={(v: number) => [`${v.toFixed(1)}`, 'Score']}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="hsl(234, 89%, 74%)"
            strokeWidth={2}
            fill="url(#scoreFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
