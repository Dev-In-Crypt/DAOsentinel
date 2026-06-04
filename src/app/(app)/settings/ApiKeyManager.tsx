'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy } from 'lucide-react';
import { trpc } from '@/lib/trpc-client';

export function ApiKeyManager({ initialKey, plan }: { initialKey: string | null; plan: string }) {
  const [key, setKey] = useState(initialKey);
  const rotate = trpc.user.rotateApiKey.useMutation({
    onSuccess: (d) => setKey(d.apiKey),
  });
  const revoke = trpc.user.revokeApiKey.useMutation({ onSuccess: () => setKey(null) });

  if (plan === 'free') {
    return (
      <p className="text-sm text-muted-foreground">
        API access is included with Delegate Pro ($99/mo) and Fund Suite ($399/mo).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {key ? (
        <div className="flex items-center gap-2 rounded-md border bg-secondary p-3">
          <code className="flex-1 truncate font-mono text-xs">{key}</code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(key)}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Badge variant="outline">No API key yet</Badge>
      )}
      <div className="flex gap-2">
        <Button onClick={() => rotate.mutate()} disabled={rotate.isPending}>
          {key ? 'Rotate key' : 'Create key'}
        </Button>
        {key && (
          <Button variant="outline" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
            Revoke
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Send as <code>Authorization: Bearer &lt;key&gt;</code> to{' '}
        <code>https://daosentinel.xyz/api/v1/proposals</code> etc. Rotating invalidates the old key
        immediately.
      </p>
    </div>
  );
}
