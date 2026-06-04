'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';

export function WatchlistEditor({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial);
  const [input, setInput] = useState('');
  const update = trpc.user.updateWatchlist.useMutation();

  function commit(next: string[]) {
    setItems(next);
    update.mutate({ watchedDaos: next });
  }

  function add() {
    const slug = input.trim().toLowerCase();
    if (!slug || items.includes(slug)) return;
    commit([...items, slug]);
    setInput('');
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.map((slug) => (
          <Badge key={slug} variant="secondary" className="gap-1">
            {slug}
            <button
              type="button"
              onClick={() => commit(items.filter((s) => s !== slug))}
              className="rounded-full hover:bg-destructive/20"
              aria-label={`Remove ${slug}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {items.length === 0 && (
          <span className="text-sm text-muted-foreground">No DAOs watched yet.</span>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="DAO slug (e.g. uniswap)"
          className="max-w-xs"
        />
        <Button type="submit" disabled={!input.trim() || update.isPending}>
          Add
        </Button>
      </form>
      {update.error && (
        <p className="text-xs text-destructive">{update.error.message}</p>
      )}
    </div>
  );
}
