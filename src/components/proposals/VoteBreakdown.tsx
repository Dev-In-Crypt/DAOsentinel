import { ProgressBar } from '@/components/ui/progress';
import { formatNumber } from '@/lib/utils';

export function VoteBreakdown({
  choices,
  scores,
  total,
}: {
  choices: string[];
  scores: number[] | null;
  total: number;
}) {
  const s = scores ?? [];
  return (
    <div className="space-y-2">
      {choices.map((choice, i) => {
        const v = Number(s[i] ?? 0);
        const pct = total > 0 ? (v / total) * 100 : 0;
        return (
          <div key={i}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{choice}</span>
              <span className="font-mono">
                {formatNumber(v)} ({pct.toFixed(1)}%)
              </span>
            </div>
            <ProgressBar value={pct} />
          </div>
        );
      })}
    </div>
  );
}
