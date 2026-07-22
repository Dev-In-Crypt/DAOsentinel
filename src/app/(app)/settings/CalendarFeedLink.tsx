'use client';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

export function CalendarFeedLink({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-secondary p-3">
      <code className="flex-1 truncate font-mono text-xs">{url}</code>
      <Button type="button" variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(url)}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}
