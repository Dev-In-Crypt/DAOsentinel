import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WatchlistEditor } from './WatchlistEditor';
import { ApiKeyManager } from './ApiKeyManager';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  const [user] = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Manage your plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <span>Plan:</span>
            <Badge variant={user.plan === 'free' ? 'secondary' : 'success'}>{user.plan}</Badge>
          </div>
          {user.plan !== 'free' && (
            <p className="text-sm text-muted-foreground">
              API quota used this month: {user.apiCallsThisMonth ?? 0}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Watched DAOs</CardTitle>
          <CardDescription>
            Whale alerts, swings, and score drops for these DAOs ping you on Telegram &amp; email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WatchlistEditor initial={user.watchedDaos ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API key</CardTitle>
          <CardDescription>Premium: programmatic access to the DAO Sentinel dataset.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeyManager initialKey={user.apiKey ?? null} plan={user.plan} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>Email: {user.alertEmail ? 'on' : 'off'}</div>
          <div>Telegram: {user.alertTelegram ? `chat ${user.telegramChatId ?? '—'}` : 'off'}</div>
        </CardContent>
      </Card>
    </div>
  );
}
