import { Badge } from '@/components/ui/badge';

export function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <Badge variant="outline">unrated</Badge>;
  const lower = level.toLowerCase();
  if (lower === 'high') return <Badge variant="destructive">🔴 HIGH RISK</Badge>;
  if (lower === 'medium') return <Badge variant="warning">🟠 MEDIUM</Badge>;
  return <Badge variant="success">🟢 LOW</Badge>;
}
