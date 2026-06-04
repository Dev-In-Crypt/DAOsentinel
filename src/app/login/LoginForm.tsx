'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginForm() {
  const sp = useSearchParams();
  const verify = sp.get('verify');
  const [email, setEmail] = useState('');

  if (verify) {
    return (
      <div className="container max-w-md py-24">
        <Card>
          <CardHeader>
            <CardTitle>Check your inbox</CardTitle>
            <CardDescription>
              We sent you a magic link. Open it on this device to sign in.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-md py-24">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to DAO Sentinel</CardTitle>
          <CardDescription>We&apos;ll email you a magic link — no password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (email) signIn('resend', { email });
            }}
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Button type="submit" className="w-full">
              Email me a magic link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
