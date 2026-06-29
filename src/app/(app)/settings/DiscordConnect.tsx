'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc-client';

export function DiscordConnect({ initialUrl }: { initialUrl: string | null }) {
  const [saved, setSaved] = useState<string | null>(initialUrl);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = trpc.user.setDiscordWebhook.useMutation({
    onSuccess: () => {
      setSaved(url.trim());
      setUrl('');
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const clear = trpc.user.clearDiscordWebhook.useMutation({
    onSuccess: () => setSaved(null),
  });

  if (saved) {
    // Mask the token portion of the webhook for display.
    const masked = saved.replace(/\/[\w-]+$/, '/••••••');
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="success">Connected</Badge>
          <span className="mono truncate text-xs text-[hsl(var(--text-dim))]">{masked}</span>
        </div>
        <p className="text-xs text-[hsl(var(--text-dim))]">
          Warning and critical alerts for your watched DAOs are posted to this Discord channel.
        </p>
        <Button variant="outline" onClick={() => clear.mutate()} disabled={clear.isPending}>
          Remove webhook
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[hsl(var(--text-dim))]">
        In your Discord server: <b>Server Settings → Integrations → Webhooks → New Webhook</b>, copy
        the URL and paste it here. We&rsquo;ll send a test message to confirm.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          className="h-10 min-w-[280px] flex-1 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
        />
        <Button onClick={() => save.mutate({ url })} disabled={save.isPending || !url.trim()}>
          {save.isPending ? 'Verifying…' : 'Connect'}
        </Button>
      </div>
      {error && <p className="text-xs" style={{ color: 'hsl(var(--rose))' }}>{error}</p>}
    </div>
  );
}
