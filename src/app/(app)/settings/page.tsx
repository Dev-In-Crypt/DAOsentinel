import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { WatchlistEditor } from './WatchlistEditor';
import { ApiKeyManager } from './ApiKeyManager';
import { TelegramConnect } from './TelegramConnect';
import { DiscordConnect } from './DiscordConnect';
import { CalendarFeedLink } from './CalendarFeedLink';
import { connectLink, makeLinkToken } from '@/lib/telegram';

const APP_BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Settings — DAO Sentinel',
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, session.user.email))
    .limit(1);
  if (!user) redirect('/login');

  // Telegram section is shown only once the bot is configured (connectLink is
  // non-null) or the user already linked a chat. The bot isn't live yet, so
  // this stays hidden until TELEGRAM_BOT_USERNAME/TOKEN are set.
  const telegramLink = connectLink(user.id);
  const showTelegram = Boolean(telegramLink) || Boolean(user.telegramChatId);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={user.email}
        title="Account"
        highlight="Settings"
        description="Manage your watchlist, alert preferences and API access."
      />

      <section>
        <h2 className="app-sec-title">Plan</h2>
        <div className="glass-card">
          <div className="flex items-center gap-2">
            <Badge variant="success">Public good</Badge>
            <span className="text-sm text-[hsl(var(--text-dim))]">
              Every feature is free — no tiers, no paywalls.
            </span>
          </div>
          <p className="mt-2 text-sm text-[hsl(var(--text-dim))]">
            API calls this month: <span className="mono">{user.apiCallsThisMonth ?? 0}</span>{' '}
            <span className="text-[hsl(var(--text-faint))]">/ 5,000</span>
          </p>
        </div>
      </section>

      <section>
        <h2 className="app-sec-title">Watched DAOs</h2>
        <div className="glass-card">
          <p className="mb-4 text-sm text-[hsl(var(--text-dim))]">
            Whale alerts, swings, and score drops for these DAOs ping you via email (and Discord if
            connected).
          </p>
          <WatchlistEditor initial={user.watchedDaos ?? []} />
        </div>
      </section>

      <section>
        <h2 className="app-sec-title">Calendar feed</h2>
        <div className="glass-card">
          <p className="mb-4 text-sm text-[hsl(var(--text-dim))]">
            Subscribe in Google Calendar, Apple Calendar, or Outlook to see your watched DAOs&apos;
            voting deadlines alongside your other events. Calendar apps poll this URL on their own
            schedule (typically hourly) — no login required to view it.
          </p>
          <CalendarFeedLink url={`${APP_BASE}/api/ics/watchlist/${makeLinkToken(user.id)}`} />
        </div>
      </section>

      <section>
        <h2 className="app-sec-title">API key</h2>
        <div className="glass-card">
          <p className="mb-4 text-sm text-[hsl(var(--text-dim))]">
            Free programmatic access to the DAO Sentinel dataset.
          </p>
          <ApiKeyManager initialKey={user.apiKey ?? null} />
        </div>
      </section>

      {showTelegram && (
        <section>
          <h2 className="app-sec-title">Telegram alerts</h2>
          <div className="glass-card">
            <TelegramConnect
              connectUrl={telegramLink}
              initialChatId={user.telegramChatId ?? null}
              initialEnabled={Boolean(user.alertTelegram)}
            />
          </div>
        </section>
      )}

      <section>
        <h2 className="app-sec-title">Discord alerts</h2>
        <div className="glass-card">
          <DiscordConnect initialUrl={user.discordWebhookUrl ?? null} />
        </div>
      </section>

      <section>
        <h2 className="app-sec-title">Email alerts</h2>
        <div className="glass-card text-sm">
          Email alerts:{' '}
          <span className="mono text-[hsl(var(--text-dim))]">{user.alertEmail ? 'on' : 'off'}</span>
          <p className="mt-2 text-xs text-[hsl(var(--text-dim))]">
            Whale, swing and quorum alerts for your watched DAOs are emailed to{' '}
            <span className="mono">{user.email}</span>.
          </p>
        </div>
      </section>
    </div>
  );
}
