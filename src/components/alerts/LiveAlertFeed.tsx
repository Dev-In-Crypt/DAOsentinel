'use client';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { timeAgo } from '@/lib/utils';

interface LiveAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  daoSlug: string;
  daoName: string;
  proposalId: string | null;
  createdAt: string;
}

export function LiveAlertFeed() {
  const [items, setItems] = useState<LiveAlert[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('/api/alerts/stream');
    es.addEventListener('hello', () => setConnected(true));
    es.addEventListener('alert', (e) => {
      try {
        const a = JSON.parse((e as MessageEvent).data) as LiveAlert;
        setItems((prev) => [a, ...prev].slice(0, 25));
      } catch {
        // ignore bad payload
      }
    });
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-3 text-xs text-muted-foreground">
          <span>{connected ? 'Live stream connected' : 'Connecting…'}</span>
          <span className={connected ? 'text-success' : 'text-muted-foreground'}>●</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="divide-y p-0">
        <div className="flex items-center justify-between px-4 py-2 text-xs">
          <span className="font-semibold">Live feed</span>
          <span className={connected ? 'text-success' : 'text-muted-foreground'}>
            ● {items.length} new
          </span>
        </div>
        {items.map((a) => (
          <div key={a.id} className="flex items-start gap-3 p-3 animate-in fade-in">
            <Badge
              variant={
                a.severity === 'critical'
                  ? 'destructive'
                  : a.severity === 'warning'
                    ? 'warning'
                    : 'secondary'
              }
            >
              {a.severity}
            </Badge>
            <div className="flex-1">
              <div className="text-sm font-medium">{a.title}</div>
              <div className="text-xs text-muted-foreground">
                {a.daoName} · {timeAgo(a.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
