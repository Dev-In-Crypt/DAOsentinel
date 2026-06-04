'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc-client';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const subscribe = trpc.newsletter.subscribe.useMutation({ onSuccess: () => setDone(true) });

  return (
    <form
      className="flex flex-wrap justify-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (email) subscribe.mutate({ email });
      }}
    >
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        required
        placeholder="you@example.com"
        className="max-w-xs"
      />
      <Button type="submit" disabled={subscribe.isPending || done}>
        {done ? '✓ Subscribed' : subscribe.isPending ? 'Subscribing…' : 'Subscribe'}
      </Button>
    </form>
  );
}
