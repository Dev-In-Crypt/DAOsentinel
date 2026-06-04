import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { WatchlistEditor } from './WatchlistEditor';
import { ApiKeyManager } from './ApiKeyManager';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);
  if (!user) redirect('/login');

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={user.email}
        title="Account"
        highlight="Settings"
        description="Manage your watchlist, alert preferences and API access."
      />

      <section>
        <h2 className="app-sec-title">Subscription</h2>
        <div className="glass-card">
          <div className="flex items-center gap-2">
            <span className="text-sm">Plan</span>
            <Badge variant={user.plan === 'free' ? 'secondary' : 'success'}>{user.plan}</Badge>
          </div>
          {user.plan !== 'free' && (
            <p className="mt-2 text-sm text-[hsl(var(--text-dim))]">
              API quota used this month: <span className="mono">{user.apiCallsThisMonth ?? 0}</span>
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="app-sec-title">Watched DAOs</h2>
        <div className="glass-card">
          <p className="mb-4 text-sm text-[hsl(var(--text-dim))]">
            Whale alerts, swings, and score drops for these DAOs ping you via Telegram &amp; email.
          </p>
          <WatchlistEditor initial={user.watchedDaos ?? []} />
        </div>
      </section>

      <section>
        <h2 className="app-sec-title">API key</h2>
        <div className="glass-card">
          <p className="mb-4 text-sm text-[hsl(var(--text-dim))]">
            Premium: programmatic access to the DAO Sentinel dataset.
          </p>
          <ApiKeyManager initialKey={user.apiKey ?? null} plan={user.plan} />
        </div>
      </section>

      <section>
        <h2 className="app-sec-title">Alert preferences</h2>
        <div className="glass-card space-y-1 text-sm">
          <div>
            Email: <span className="mono text-[hsl(var(--text-dim))]">{user.alertEmail ? 'on' : 'off'}</span>
          </div>
          <div>
            Telegram:{' '}
            <span className="mono text-[hsl(var(--text-dim))]">
              {user.alertTelegram ? `chat ${user.telegramChatId ?? '—'}` : 'off'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
